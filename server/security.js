const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const csrfCookieName = 'csrf_token';
const nonceCache = new Set();

// Limpeza simples do cache de nonces (idealmente usar Redis)
setInterval(() => {
  nonceCache.clear();
}, 60 * 60 * 1000);

const generateCsrfToken = (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(csrfCookieName, token, {
    httpOnly: true, // O frontend vai ler da resposta JSON, não precisa ler o cookie via document.cookie
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
  return res.status(200).json({ csrfToken: token });
};

const requireCsrfAndNonce = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const headerCsrf = req.headers['x-csrf-token'];
  const cookieCsrf = req.cookies[csrfCookieName];
  if (!headerCsrf || !cookieCsrf || headerCsrf !== cookieCsrf) {
    return res.status(403).json({ message: 'Falha na verificação CSRF' });
  }

  const nonce = req.headers['x-nonce'];
  if (!nonce) {
    return res.status(403).json({ message: 'Nonce ausente na requisição' });
  }
  if (nonceCache.has(nonce)) {
    return res.status(403).json({ message: 'Requisição duplicada detectada (Replay)' });
  }
  nonceCache.add(nonce);

  next();
};

const requireAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Acesso negado: JWT ausente' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey123');
    req.user = decoded; // { id: userId }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
};

const validateMagicBytes = async (req, res, next) => {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return next();
  }

  const files = req.file ? [req.file] : req.files;
  
  try {
    const { fileTypeFromFile } = await import('file-type');

    for (const file of files) {
      const type = await fileTypeFromFile(file.path);
      
      // Se não conseguiu identificar, ou não é imagem/vídeo, rejeita e deleta
      if (!type || (!type.mime.startsWith('image/') && !type.mime.startsWith('video/'))) {
        const fs = require('fs');
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: 'Arquivo inválido ou corrompido. Validação de segurança falhou.' });
      }
    }
    
    next();
  } catch (error) {
    console.error('Magic bytes validation error:', error);
    return res.status(500).json({ message: 'Erro na validação do arquivo.' });
  }
};

module.exports = {
  generateCsrfToken,
  requireCsrfAndNonce,
  requireAuth,
  validateMagicBytes
};
