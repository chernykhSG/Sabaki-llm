var vectorStore = require('./vectorStore');
var embeddingGenerator = require('./embeddingGenerator');
var { promises: fs } = require('fs');
var path = require('path');
var { app } = require('electron').remote || require('@electron/remote');

// 为vectorStore添加持久化配置
vectorStore.setPersistence = function(dbPath) {
  if (this.client && this.client.options) {
    this.client.options.persistDirectory = dbPath;
  }
};

class RAGManager {
  constructor() {
    this.sessionId = null;
    this.isInitialized = false;
    this.appDataPath = app ? app.getPath('userData') : (process.env.HOME || process.env.USERPROFILE);
    this.memoryStorePath = path.join(this.appDataPath, '.sabaki', 'rag_memory');
    this.vectorDbPath = path.join(this.memoryStorePath, 'vector_db');
    this.sessionIndexPath = path.join(this.memoryStorePath, 'sessions.json');
    this.sessions = {};
    this.maxMemoryAge = 30 * 24 * 60 * 60 * 1000; // 30天过期
  }

  async initialize(sessionId = `session_${Date.now()}`) {
    if (this.isInitialized) return;
    
    this.sessionId = sessionId;
    
    // 确保必要的目录存在
    await this._ensureMemoryDirectory();
    
    // 配置ChromaDB持久化路径
    vectorStore.setPersistence(this.vectorDbPath);
    
    // 初始化所有组件
    await Promise.all([
      vectorStore.initialize(),
      embeddingGenerator.initialize(),
      this._loadSessionIndex(),
      this._cleanupExpiredMemories()
    ]);
    
    // 记录当前会话
    this.sessions[sessionId] = {
      startTime: Date.now(),
      lastActive: Date.now()
    };
    
    await this._saveSessionIndex();
    this.isInitialized = true;
    
    console.log('RAG系统初始化完成，会话ID:', sessionId);
  }

  async storeMemory(content, metadata = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const enrichedMetadata = {
      ...metadata,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      source: 'user_interaction'
    };
    
    const embeddings = await embeddingGenerator.generateEmbeddings(content);
    const docId = await vectorStore.addDocuments([content], embeddings, [enrichedMetadata]);
    
    await this._saveToDisk(content, enrichedMetadata);
    await this.updateSessionActivity();
    
    return { success: true, docId: docId[0] };
  }

  async retrieveMemories(query, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const { 
      nResults = 5, 
      includeSessionOnly = false,
      filters = {}
    } = options;
    
    const queryEmbedding = await embeddingGenerator.generateEmbeddings(query);
    
    const searchFilters = {
      ...filters,
      ...(includeSessionOnly && { sessionId: this.sessionId })
    };
    
    const results = await vectorStore.query(
      queryEmbedding[0],
      nResults,
      Object.keys(searchFilters).length > 0 ? searchFilters : undefined
    );
    
    return this._formatResults(results);
  }

  async getSessionSummary() {
    const memories = await this.retrieveMemories('session summary', {
      nResults: 10,
      includeSessionOnly: true
    });
    
    return {
      sessionId: this.sessionId,
      memoryCount: memories.length,
      recentMemories: memories.slice(0, 3)
    };
  }

  async clearSessionMemory() {
    if (!this.isInitialized || !this.sessionId) return;
    
    await vectorStore.collection.delete({
      where: { sessionId: this.sessionId }
    });
  }

  _formatResults(results) {
    const { documents, metadatas, distances } = results;
    
    return documents.map((doc, index) => ({
      content: doc,
      metadata: metadatas[index] || {},
      relevance: 1 - distances[index] || 0,
      timestamp: metadatas[index]?.timestamp || Date.now()
    })).sort((a, b) => b.relevance - a.relevance);
  }

  async _ensureMemoryDirectory() {
    try {
      await fs.mkdir(this.memoryStorePath, { recursive: true });
    } catch (error) {
      console.error('创建记忆目录失败:', error);
    }
  }

  async _saveToDisk(content, metadata) {
    try {
      // 按会话ID组织目录结构
      const sessionDir = path.join(this.memoryStorePath, metadata.sessionId);
      await fs.mkdir(sessionDir, { recursive: true });
      
      const memoryFile = path.join(
        sessionDir,
        `${Date.now()}.json`
      );
      
      await fs.writeFile(
        memoryFile,
        JSON.stringify({ content, metadata }),
        'utf8'
      );
    } catch (error) {
      console.error('保存记忆到磁盘失败:', error);
    }
  }

  async _loadSessionIndex() {
    try {
      const data = await fs.readFile(this.sessionIndexPath, 'utf8');
      this.sessions = JSON.parse(data);
    } catch (error) {
      this.sessions = {};
    }
  }

  async _saveSessionIndex() {
    try {
      await fs.writeFile(
        this.sessionIndexPath,
        JSON.stringify(this.sessions),
        'utf8'
      );
    } catch (error) {
      console.error('保存会话索引失败:', error);
    }
  }

  async _cleanupExpiredMemories() {
    try {
      const now = Date.now();
      const expiredSessions = [];
      
      // 清理过期会话
      for (const [sessionId, sessionData] of Object.entries(this.sessions)) {
        if (now - sessionData.lastActive > this.maxMemoryAge) {
          expiredSessions.push(sessionId);
          const sessionDir = path.join(this.memoryStorePath, sessionId);
          
          try {
            await fs.rm(sessionDir, { recursive: true, force: true });
          } catch (e) {
            console.error(`清理会话目录失败 ${sessionId}:`, e);
          }
        }
      }
      
      // 从索引中移除过期会话
      for (const sessionId of expiredSessions) {
        delete this.sessions[sessionId];
      }
      
      if (expiredSessions.length > 0) {
        await this._saveSessionIndex();
        console.log(`清理了 ${expiredSessions.length} 个过期会话`);
      }
    } catch (error) {
      console.error('清理过期记忆失败:', error);
    }
  }

  async exportMemory(sessionId = null) {
    const targetSessionId = sessionId || this.sessionId;
    const sessionDir = path.join(this.memoryStorePath, targetSessionId);
    const memories = [];
    
    try {
      const files = await fs.readdir(sessionDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(sessionDir, file), 'utf8');
          memories.push(JSON.parse(content));
        }
      }
      
      return memories;
    } catch (error) {
      console.error('导出记忆失败:', error);
      return [];
    }
  }

  async updateSessionActivity() {
    if (this.sessionId && this.sessions[this.sessionId]) {
      this.sessions[this.sessionId].lastActive = Date.now();
      await this._saveSessionIndex();
    }
  }

  async importRelevantHistory(context) {
    const memories = await this.retrieveMemories(context, {
      nResults: 3,
      includeSessionOnly: false
    });
    
    const m = memories.map(mem => mem.content).join('\n\n---\n\n');
    return m;
  }
}

// 创建并导出单例实例
const ragManager = new RAGManager();
module.exports = ragManager;

// 也导出类本身，方便测试和扩展
module.exports.RAGManager = RAGManager;