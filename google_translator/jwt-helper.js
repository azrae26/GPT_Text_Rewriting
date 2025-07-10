/**
 * JWT 輔助工具
 * 注意：此實現僅用於演示目的。在生產環境中，JWT 簽名應該在安全的後端服務中進行。
 */
window.JWTHelper = {
  
  /**
   * Base64URL 編碼
   */
  base64UrlEncode(str) {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },

  /**
   * 創建未簽名的 JWT
   * 注意：這個實現不包含實際的 RSA 簽名，僅用於演示
   */
  async createUnsignedJWT(header, payload) {
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    
    // 警告：實際應用中需要使用私鑰進行 RSA 簽名
    const signature = this.base64UrlEncode('UNSIGNED_TOKEN_FOR_DEMO_ONLY');
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  },

  /**
   * 檢查是否支援 Web Crypto API
   */
  isWebCryptoSupported() {
    return !!(window.crypto && window.crypto.subtle);
  },

  /**
   * 顯示安全警告
   */
  showSecurityWarning() {
    LogUtils.warn(`
      ⚠️ 安全警告 ⚠️
      
      當前實現為演示版本，不適用於生產環境。
      
      建議解決方案：
      1. 設置後端代理服務來處理 Google Cloud API 調用
      2. 在後端進行 JWT 簽名和 API 調用
      3. 前端只向您的後端發送請求
      
      這樣可以保護您的 Google Cloud 服務帳戶金鑰安全。
    `);
  },

  /**
   * 創建已簽名的 JWT（使用 Web Crypto API）
   */
  async createSignedJWT(header, payload, privateKeyPem) {
    try {
      if (!this.isWebCryptoSupported()) {
        throw new Error('瀏覽器不支援 Web Crypto API');
      }

      // 處理 PEM 格式的私鑰
      const privateKeyData = this.pemToArrayBuffer(privateKeyPem);
      
      // 導入私鑰
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyData,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        false,
        ['sign']
      );

      // 創建待簽名的內容
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      // 使用私鑰簽名
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(signingInput)
      );

      // 編碼簽名
      const encodedSignature = this.base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
      );

      return `${signingInput}.${encodedSignature}`;
    } catch (error) {
      LogUtils.error('JWT 簽名失敗:', error);
      throw new Error('無法創建簽名的 JWT: ' + error.message);
    }
  },

  /**
   * 將 PEM 格式的私鑰轉換為 ArrayBuffer
   */
  pemToArrayBuffer(pem) {
    // 移除 PEM 頭尾和換行符
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = pem
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');

    // Base64 解碼
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }
}; 