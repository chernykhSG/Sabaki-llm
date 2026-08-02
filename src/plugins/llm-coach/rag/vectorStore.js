var { ChromaClient } = require('chromadb');

class VectorStore {
  constructor() {
    this.client = null;
    this.collection = null;
    this.isInitialized = false;
    this.collectionName = 'sabaki_rag_memory';
    this.persistDirectory = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // 初始化ChromaDB客户端
    const clientOptions = {};
    if (this.persistDirectory) {
      clientOptions.persistDirectory = this.persistDirectory;
      clientOptions.path = this.persistDirectory; // 确保路径正确配置
    }
    
    this.client = new ChromaClient(clientOptions);
    
    // 创建或获取集合
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: { 
          description: 'Sabaki RAG记忆存储',
          persistDirectory: this.persistDirectory
        }
      });
      this.isInitialized = true;
      
      // 持久化数据
      if (this.client.persist) {
        await this.client.persist();
      }
      
      console.log('向量存储初始化完成，持久化路径:', this.persistDirectory || '内存模式');
    } catch (error) {
      console.error('初始化向量存储失败:', error);
      throw error;
    }
  }

  setPersistence(persistDir) {
    this.persistDirectory = persistDir;
    
    // 如果已经初始化，尝试重新配置
    if (this.client && this.client.options) {
      this.client.options.persistDirectory = persistDir;
      this.client.options.path = persistDir;
    }
  }

  async addDocuments(documents, embeddings, metadatas = []) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // 生成唯一ID
      const ids = documents.map((_, index) => `doc_${Date.now()}_${index}`);
      
      // 添加文档到集合
      await this.collection.add({
        ids,
        embeddings,
        documents,
        metadatas: metadatas.length > 0 ? metadatas : Array(documents.length).fill({ timestamp: Date.now() })
      });
      
      // 持久化数据
      if (this.client && this.client.persist) {
        await this.client.persist();
      }
      
      return ids;
    } catch (error) {
      console.error('添加文档到向量存储失败:', error);
      throw error;
    }
  }

  async query(queryEmbedding, nResults = 5, filters = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
      where: filters
    });
    
    return {
      documents: results.documents?.[0] || [],
      metadatas: results.metadatas?.[0] || [],
      distances: results.distances?.[0] || []
    };
  }

  async getStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const count = await this.collection.count();
    return { count };
  }

  async clearCollection() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // 获取所有文档ID
      const result = await this.collection.get({
        include: ['ids']
      });
      
      if (result.ids && result.ids.length > 0) {
        // 删除所有文档
        await this.collection.delete({
          ids: result.ids
        });
        
        // 持久化删除操作
        if (this.client && this.client.persist) {
          await this.client.persist();
        }
      }
      
      return { success: true, message: '向量存储已清空' };
    } catch (error) {
      console.error('清空向量存储失败:', error);
      throw error;
    }
  }

  async forcePersist() {
    "use strict";
    try {
      if (this.client && this.client.persist) {
        await this.client.persist();
        return { success: true, message: '数据已强制持久化' };
      }
      return { success: false, message: '不支持持久化操作' };
    } catch (error) {
      console.error('强制持久化失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new VectorStore();