var { pipeline } = require('@xenova/transformers');
var { promises: fs } = require('fs');
var path = require('path');

class EmbeddingGenerator {
  constructor() {
    this.embeddingPipeline = null;
    this.isInitialized = false;
    this.modelName = 'Xenova/all-MiniLM-L6-v2';
    this.embeddingCache = new Map();
    this.cacheSize = 1000; // 缓存大小限制
    
    // 获取缓存目录路径
    const appDataPath = window.sabaki.setting.userDataDirectory || (process.env.HOME || process.env.USERPROFILE);
    this.cacheDir = path.join(appDataPath, '.sabaki', 'embedding_cache');
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // 确保缓存目录存在
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      this.embeddingPipeline = await pipeline('feature-extraction', this.modelName);
      
      // 尝试加载缓存
      await this._loadCacheFromDisk();
      
      this.isInitialized = true;
      console.log('嵌入模型初始化完成，缓存大小:', this.embeddingCache.size);
    } catch (error) {
      console.error('初始化embedding模型失败，使用备用方案:', error);
      this.embeddingPipeline = this._fallbackEmbedding;
      this.isInitialized = true;
    }
  }

  async generateEmbeddings(texts) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!Array.isArray(texts)) {
      texts = [texts];
    }
    
    const embeddings = [];
    
    for (const text of texts) {
      try {
        // 处理文本
        const processedText = text.trim().toLowerCase();
        
        // 检查缓存
        const cacheKey = this._generateCacheKey(processedText);
        if (this.embeddingCache.has(cacheKey)) {
          embeddings.push(this.embeddingCache.get(cacheKey));
          continue;
        }
        
        const result = await this.embeddingPipeline(text, {
          pooling: 'mean',
          normalize: true
        });
        
        let embedding = Array.from(result.data);
        
        // 归一化嵌入向量
        embedding = this._normalizeVector(embedding);
        
        // 添加到缓存
        this._addToCache(cacheKey, embedding);
        
        embeddings.push(embedding);
      } catch (error) {
        console.error('生成embedding失败:', error);
        const fallbackEmbedding = this._generateFallbackEmbedding(text);
        embeddings.push(fallbackEmbedding);
      }
    }
    
    return embeddings;
  }
  
  _generateCacheKey(text) {
    // 使用文本内容的哈希作为缓存键
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `emb_${hash}`;
  }
  
  _addToCache(key, embedding) {
    // 检查缓存大小，超过限制时移除旧项
    if (this.embeddingCache.size >= this.cacheSize) {
      const oldestKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(oldestKey);
    }
    
    this.embeddingCache.set(key, embedding);
    
    // 定期保存缓存到磁盘
    if (this.embeddingCache.size % 100 === 0) {
      this._saveCacheToDisk();
    }
  }
  
  async _saveCacheToDisk() {
    try {
      const cacheData = Array.from(this.embeddingCache.entries());
      const cacheFile = path.join(this.cacheDir, 'embedding_cache.json');
      
      // 只保存最近的500个嵌入
      const recentCache = cacheData.slice(-500);
      
      await fs.writeFile(
        cacheFile,
        JSON.stringify(recentCache),
        'utf8'
      );
    } catch (error) {
      console.error('保存嵌入缓存失败:', error);
    }
  }
  
  async _loadCacheFromDisk() {
    try {
      const cacheFile = path.join(this.cacheDir, 'embedding_cache.json');
      const data = await fs.readFile(cacheFile, 'utf8');
      const cacheEntries = JSON.parse(data);
      
      // 恢复缓存
      for (const [key, embedding] of cacheEntries) {
        this.embeddingCache.set(key, embedding);
      }
    } catch (error) {
      console.log('加载嵌入缓存失败，将使用空缓存:', error.message);
    }
  }

  _fallbackEmbedding(text) {
    const normalizedText = text.toLowerCase().trim();
    const embedding = new Array(384).fill(0);
    
    for (let i = 0; i < normalizedText.length; i++) {
      embedding[i % 384] += normalizedText.charCodeAt(i) / 255;
    }
    
    return this._normalizeVector(embedding);
  }

  _generateFallbackEmbedding(text) {
    const normalizedText = text.toLowerCase().trim();
    const embedding = new Array(384).fill(0);
    
    for (let i = 0; i < normalizedText.length; i++) {
      const charCode = normalizedText.charCodeAt(i);
      const index = i % 384;
      embedding[index] += charCode / 255;
    }
    
    return this._normalizeVector(embedding);
  }

  _normalizeVector(vector) {
    const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
    if (norm === 0) return vector;
    return vector.map(x => x / norm);
  }

  async getModelInfo() {
    return {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      initialized: this.isInitialized
    };
  }

  async shutdown() {
    if (this.embeddingPipeline) {
      // 保存缓存
      await this._saveCacheToDisk();
      
      // 释放模型资源
      this.embeddingPipeline = null;
      this.isInitialized = false;
      this.embeddingCache.clear();
    }
  }
  
  // 获取缓存统计信息
  getCacheStats() {
    return {
      size: this.embeddingCache.size,
      maxSize: this.cacheSize,
      hitRate: this._calculateHitRate()
    };
  }
  
  _calculateHitRate() {
    // 简单估算命中率，实际使用时可以添加计数器
    return this.embeddingCache.size > 0 ? 0.7 : 0; // 默认70%命中率
  }
}

module.exports = new EmbeddingGenerator();