const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const CircuitBreaker = require('opossum');
const { generateCsrfToken, requireCsrfAndNonce, requireAuth, validateMagicBytes } = require('./security');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // Limit each IP to 1000 requests per `window`
  standardHeaders: 'draft-7', 
  legacyHeaders: false, 
  message: { message: 'Muitas requisições deste IP, por favor tente novamente mais tarde.' }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" } // Permite recursos cruzados (uploads)
}));
app.use(cookieParser());
app.use(globalLimiter);

// Configuração CORS com credentials
app.use(cors({
  origin: true, // Reflete a origem de quem chamou
  credentials: true
}));
app.use(express.json());

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'profileImage') {
      cb(null, 'uploads/profiles/');
    } else if (file.fieldname === 'coverImage') {
      cb(null, 'uploads/covers/');
    } else if (file.fieldname === 'postMedia') {
      cb(null, 'uploads/posts/');
    } else {
      cb(new Error('Invalid fieldname'), false);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit to allow videos
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido! Apenas imagens e vídeos são permitidos.'), false);
    }
  }
});

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'arquivosgta_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Circuit Breaker para proteger o Banco de Dados contra falhas em cascata
const dbOptions = {
  timeout: 5000, 
  errorThresholdPercentage: 50, 
  resetTimeout: 30000 
};
const originalExecute = pool.execute.bind(pool);
const executeBreaker = new CircuitBreaker(originalExecute, dbOptions);
executeBreaker.fallback(() => {
  throw new Error('Database Circuit Breaker is OPEN - Request dropped to prevent cascading failure');
});
pool.execute = function(...args) {
  return executeBreaker.fire(...args);
};

// Create tables if they don't exist
const initDb = async () => {
  try {
    const connection = await pool.getConnection();
    // Ensure all tables are created correctly
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL UNIQUE,
        identifier VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        birth_date DATE,
        profile_url VARCHAR(255) DEFAULT NULL,
        cover_url VARCHAR(255) DEFAULT NULL,
        accepted_terms TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        content TEXT,
        media_url VARCHAR(255) DEFAULT NULL,
        media_type ENUM('image', 'video') DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS post_media (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        media_url VARCHAR(255) NOT NULL,
        media_type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_like (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        follower_id INT NOT NULL,
        following_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_follow (follower_id, following_id),
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        from_user_id INT NOT NULL,
        post_id INT DEFAULT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS post_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        reporter_id INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    connection.release();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    // If the database doesn't exist, log a message
    if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('Please create the database "arquivosgta_db" in XAMPP phpMyAdmin, then restart the server.');
    }
  }
};

initDb();

// Rota para o Frontend pegar o CSRF Token
app.get('/api/csrf', generateCsrfToken);

// Ignoramos a validação de CSRF para login e outras rotas públicas se necessário
// Mas podemos aplicar o requireCsrfAndNonce globalmente nas rotas da API:
app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/csrf') {
    return next();
  }
  requireCsrfAndNonce(req, res, next);
});

app.post('/api/login', [
  body('identifier').trim().escape(),
  body('password').trim().escape() // Para segurança contra XSS e SQLi (mesmo usando prepared statements, trim ajuda)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Dados inválidos detectados na requisição' });
  }

  const identifier = req.body.identifier || req.body.email;
  const { password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
  }

  try {
    const [existing] = await pool.execute(
      `SELECT id, name, username, profile_url, cover_url, password
       FROM users 
       WHERE (identifier = ? OR username = ?)`,
      [identifier, identifier]
    );

    if (existing.length === 0) {
      return res.status(401).json({ message: 'Usuário ou senha incorretos' });
    }

    const user = existing[0];
    let isMatch = false;

    // Check if password is a bcrypt hash (starts with $2b$ or $2a$)
    if (user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Fallback for plaintext (and optionally hash and update DB here in production)
      isMatch = (password === user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'Usuário ou senha incorretos' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'supersecretkey123', { expiresIn: '7d' });

    // Remove password before sending to client
    delete user.password;

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Ajuste conforme a necessidade de CORS
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(200).json({ message: 'Login event recorded', success: true, user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
  }
});

// Logout Route
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({ message: 'Logout successfully', success: true });
});

// Upload Profile Image Route
app.post('/api/upload/profile', upload.single('profileImage'), validateMagicBytes, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  const fileUrl = `/uploads/profiles/${req.file.filename}`;

  try {
    const [result] = await pool.execute(
      'UPDATE users SET profile_url = ? WHERE id = ?',
      [fileUrl, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ message: 'Profile image updated successfully', profile_url: fileUrl });
  } catch (error) {
    console.error('Error updating profile image:', error);
    res.status(500).json({ message: 'Database error while updating image.' });
  }
});

// Upload Cover Image Route
app.post('/api/upload/cover', upload.single('coverImage'), validateMagicBytes, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  const fileUrl = `/uploads/covers/${req.file.filename}`;

  try {
    const [result] = await pool.execute(
      'UPDATE users SET cover_url = ? WHERE id = ?',
      [fileUrl, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ message: 'Cover image updated successfully', cover_url: fileUrl });
  } catch (error) {
    console.error('Error updating cover image:', error);
    res.status(500).json({ message: 'Database error while updating image.' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password, birthDate, username, acceptedTerms } = req.body;
  
  if (!email || !password || !name || !birthDate || !username || acceptedTerms === undefined) {
    return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
  }

  try {
    // Check if email already exists
    const [existingEmail] = await pool.execute(
      'SELECT id FROM users WHERE identifier = ?',
      [email]
    );

    if (existingEmail.length > 0) {
      return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
    }

    // Check if username already exists
    const [existingUsername] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsername.length > 0) {
      return res.status(400).json({ message: 'Este nome de usuário já está em uso.' });
    }

    const [result] = await pool.execute(
      'INSERT INTO users (name, identifier, password, birth_date, username, accepted_terms) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, password, birthDate, username, acceptedTerms ? 1 : 0]
    );

    // Get the created user ID
    const userId = result.insertId;

    // Send the user info back so the app can display all user details
    return res.status(201).json({ 
      message: 'Conta criada com sucesso', 
      success: true, 
      user: { id: userId, name, username, profile_url: null, cover_url: null } 
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Erro no servidor. Tente novamente mais tarde.' });
  }
});

// Get User by Username
app.get('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    console.log('API Request - Fetching user:', username);
    const cleanUsername = username.replace(/^@/, '');
    console.log('Searching for Clean Username:', cleanUsername, 'or Prefixed:', `@${cleanUsername}`);
    const [users] = await pool.execute(
      'SELECT id, name, username, profile_url, cover_url, created_at FROM users WHERE username = ? OR username = ?',
      [cleanUsername, `@${cleanUsername}`]
    );
    console.log('Users found in DB:', users.length);

    if (users.length === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.status(200).json(users[0]);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ message: 'Erro ao carregar perfil.' });
  }
});

app.post('/api/posts', upload.array('postMedia', 10), validateMagicBytes, [
  body('content').trim().escape() // Sanitização de XSS no conteúdo
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'O conteúdo contém caracteres inválidos ou maliciosos.' });
  }

  const { userId, content } = req.body;
  console.log('--- Incoming Multi-Post ---');
  console.log('User ID:', userId);
  console.log('Files:', req.files ? req.files.length : 0);
  
  if (!userId) {
    return res.status(400).json({ message: 'O ID do usuário é obrigatório.' });
  }

  try {
    // 1. Create the Post record
    const [postResult] = await pool.execute(
      'INSERT INTO posts (user_id, content) VALUES (?, ?)',
      [userId, content || null]
    );
    const postId = postResult.insertId;

    // 2. Save all media files
    const mediaItems = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = `/uploads/posts/${file.filename}`;
        const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
        
        await pool.execute(
          'INSERT INTO post_media (post_id, media_url, media_type) VALUES (?, ?, ?)',
          [postId, url, type]
        );
        mediaItems.push({ url, type });
      }
    }

    res.status(201).json({ 
      message: 'Post criado com sucesso!', 
      post: {
        id: postId,
        user_id: userId,
        content: content,
        media: mediaItems
      }
    });
  } catch (error) {
    console.error('Erro ao criar post multimidia:', error);
    res.status(500).json({ message: 'Erro ao salvar publicação.' });
  }
});

app.get('/api/posts', async (req, res) => {
  console.log('Fetching posts with media...');
  try {
    // We group by post but fetch media details
    const [rows] = await pool.execute(`
      SELECT 
        p.*, u.name, u.username, u.profile_url,
        GROUP_CONCAT(pm.media_url) as media_urls,
        GROUP_CONCAT(pm.media_type) as media_types
      FROM posts p 
      JOIN users u ON p.user_id = u.id 
      LEFT JOIN post_media pm ON p.id = pm.post_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    
    // Process media collections back into arrays
    const posts = rows.map(post => {
      const urls = post.media_urls ? post.media_urls.split(',') : [];
      const types = post.media_types ? post.media_types.split(',') : [];
      const media = urls.map((url, i) => ({ url, type: types[i] }));
      
      return { 
        ...post,
        media: media.length > 0 ? media : (post.media_url ? [{ url: post.media_url, type: post.media_type }] : [])
      };
    });
    
    res.status(200).json(posts);
  } catch (error) {
    console.error('Erro ao buscar posts:', error);
    res.status(500).json({ message: 'Erro ao carregar publicações.' });
  }
});

app.put('/api/posts/:postId', upload.array('postMedia', 10), validateMagicBytes, async (req, res) => {
  const { postId } = req.params;
  const { userId, content, retainedMedia } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'O ID do usuário é obrigatório.' });
  }

  try {
    // 1. Verify Ownership
    const [existing] = await pool.execute('SELECT user_id FROM posts WHERE id = ?', [postId]);
    if (existing.length === 0) return res.status(404).json({ message: 'Post não encontrado.' });
    
    if (existing[0].user_id !== parseInt(userId)) {
      return res.status(403).json({ message: 'Você não tem permissão para editar este post.' });
    }

    // 2. Update Content
    await pool.execute('UPDATE posts SET content = ? WHERE id = ?', [content || null, postId]);

    // 3. Process existing media deletions
    // retainedMedia is a JSON string of URLs that the user kept
    let retainedUrls = [];
    try {
      if (retainedMedia) retainedUrls = JSON.parse(retainedMedia);
    } catch (e) {
      console.error('Error parsing retainedMedia:', e);
    }

    const [currentMedia] = await pool.execute('SELECT id, media_url FROM post_media WHERE post_id = ?', [postId]);
    for (const media of currentMedia) {
      if (!retainedUrls.includes(media.media_url)) {
        // Delete from HD
        const filePath = path.join(__dirname, '..', media.media_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        // Delete from DB
        await pool.execute('DELETE FROM post_media WHERE id = ?', [media.id]);
      }
    }

    // 4. Add new media files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = `/uploads/posts/${file.filename}`;
        const type = file.mimetype.startsWith('video/') ? 'video' : 'image';
        await pool.execute(
          'INSERT INTO post_media (post_id, media_url, media_type) VALUES (?, ?, ?)',
          [postId, url, type]
        );
      }
    }

    res.status(200).json({ message: 'Post atualizado com sucesso.' });
  } catch (error) {
    console.error('Edit post error:', error);
    res.status(500).json({ message: 'Erro ao editar publicação.' });
  }
});

app.delete('/api/posts/:postId', async (req, res) => {
  const { postId } = req.params;
  const userId = req.body?.userId || req.query?.userId; // Support body or query for validation

  try {
    // 1. Check if post exists and user owns it
    const [existing] = await pool.execute('SELECT user_id FROM posts WHERE id = ?', [postId]);
    if (existing.length === 0) return res.status(404).json({ message: 'Post não encontrado.' });
    
    if (existing[0].user_id !== parseInt(userId)) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir este post.' });
    }

    // 2. Delete
    await pool.execute('DELETE FROM posts WHERE id = ?', [postId]);
    res.status(200).json({ message: 'Post excluído com sucesso.' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Erro ao excluir publicação.' });
  }
});

app.post('/api/reports', async (req, res) => {
  const { postId, userId, reason } = req.body;
  if (!postId || !userId || !reason) return res.status(400).json({ message: 'Dados incompletos.' });

  try {
    await pool.execute(
      'INSERT INTO post_reports (post_id, reporter_id, reason) VALUES (?, ?, ?)',
      [postId, userId, reason]
    );

    res.status(201).json({ message: 'Denúncia registrada com sucesso.' });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ message: 'Erro ao registrar denúncia.' });
  }
});

// ─── LIKES ────────────────────────────────────────────
// Toggle like (like or unlike)
app.post('/api/likes/toggle', async (req, res) => {
  const { postId, userId } = req.body;
  if (!postId || !userId) return res.status(400).json({ message: 'Dados inválidos.' });

  try {
    const [existing] = await pool.execute(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );

    if (existing.length > 0) {
      // Already liked → unlike
      await pool.execute('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      
      // Also delete the notification if it exists
      await pool.execute(
        'DELETE FROM notifications WHERE user_id = (SELECT user_id FROM posts WHERE id = ?) AND type = "like" AND from_user_id = ? AND post_id = ?',
        [postId, userId, postId]
      );

      const [[{ count }]] = await pool.execute('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId]);
      return res.status(200).json({ liked: false, count });
    } else {
      // Not liked → like
      await pool.execute('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      
      // Notify post owner (if not liking own post)
      const [[post]] = await pool.execute('SELECT user_id FROM posts WHERE id = ?', [postId]);
      if (post && post.user_id !== userId) {
        await pool.execute(
          'INSERT INTO notifications (user_id, type, from_user_id, post_id) VALUES (?, ?, ?, ?)',
          [post.user_id, 'like', userId, postId]
        );
      }
      const [[{ count }]] = await pool.execute('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId]);
      return res.status(200).json({ liked: true, count });
    }
  } catch (error) {
    console.error('Erro ao curtir post:', error);
    res.status(500).json({ message: 'Erro ao processar curtida.' });
  }
});

// Get likes for a post (count + who liked + whether user liked)
app.get('/api/likes/:postId', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.query;
  try {
    const [[{ count }]] = await pool.execute('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId]);
    let userLiked = false;
    if (userId) {
      const [rows] = await pool.execute('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      userLiked = rows.length > 0;
    }
    const [likers] = await pool.execute(
      `SELECT u.id, u.name, u.username, u.profile_url 
       FROM post_likes pl JOIN users u ON pl.user_id = u.id 
       WHERE pl.post_id = ? ORDER BY pl.created_at DESC LIMIT 20`,
      [postId]
    );
    res.status(200).json({ count, userLiked, likers });
  } catch (error) {
    console.error('Erro ao buscar curtidas:', error);
    res.status(500).json({ message: 'Erro ao buscar curtidas.' });
  }
});
// ──────────────────────────────────────────────────────

// Follow a user
app.post('/api/follow', async (req, res) => {
  const { followerId, followingId } = req.body;
  if (!followerId || !followingId || followerId === followingId) {
    return res.status(400).json({ message: 'Dados inválidos.' });
  }
  try {
    await pool.execute(
      'INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)',
      [followerId, followingId]
    );
    // Create notification for the followed user
    await pool.execute(
      'INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, ?, ?)',
      [followingId, 'follow', followerId]
    );
    res.status(200).json({ message: 'Seguindo com sucesso!' });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ message: 'Erro ao seguir usuário.' });
  }
});

// Unfollow a user
app.delete('/api/follow', async (req, res) => {
  const { followerId, followingId } = req.body;
  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Dados inválidos.' });
  }
  try {
    // 1. Check if the follow relationship exists
    const [existing] = await pool.execute(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );

    if (existing.length > 0) {
      // 2. Delete the follow relationship
      await pool.execute(
        'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
        [followerId, followingId]
      );
      
      // 3. Create unfollow notification
      await pool.execute(
        'INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, ?, ?)',
        [followingId, 'unfollow', followerId]
      );
      
      return res.status(200).json({ message: 'Deixou de seguir.' });
    } else {
      return res.status(200).json({ message: 'Você já não seguia este usuário.' });
    }
  } catch (error) {
    console.error('Error in unfollow process:', error);
    res.status(500).json({ message: 'Erro ao processar solicitação.' });
  }
});

// Remove a follower (forced unfollow)
app.delete('/api/followers/remove', async (req, res) => {
  const { followerId, followingId } = req.body;
  if (!followerId || !followingId) {
    return res.status(400).json({ message: 'Dados inválidos.' });
  }
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );

    if (existing.length > 0) {
      await pool.execute(
        'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
        [followerId, followingId]
      );
      
      // Create unfollow notification for the removed follower
      await pool.execute(
        'INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, ?, ?)',
        [followerId, 'unfollow', followingId]
      );
      
      return res.status(200).json({ message: 'Seguidor removido.' });
    } else {
      return res.status(200).json({ message: 'O usuário não está seguindo você.' });
    }
  } catch (error) {
    console.error('Error in remove follower process:', error);
    res.status(500).json({ message: 'Erro ao processar solicitação.' });
  }
});

// Check follow status
app.get('/api/follow/status/:followerId/:followingId', async (req, res) => {
  const { followerId, followingId } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId]
    );
    res.status(200).json({ isFollowing: rows.length > 0 });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ message: 'Erro ao verificar status.' });
  }
});

// Get follow counts for a user
app.get('/api/follow/counts/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [following] = await pool.execute(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?',
      [userId]
    );
    const [followers] = await pool.execute(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = ?',
      [userId]
    );
    res.status(200).json({
      following: following[0].count,
      followers: followers[0].count
    });
  } catch (error) {
    console.error('Error getting follow counts:', error);
    res.status(500).json({ message: 'Erro ao buscar contadores.' });
  }
});

// Get list of users someone is following
app.get('/api/following/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(`
      SELECT u.id, u.name, u.username, u.profile_url
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = ?
    `, [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar lista de seguindo' });
  }
});

// Get list of followers
app.get('/api/followers/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(`
      SELECT u.id, u.name, u.username, u.profile_url
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = ?
    `, [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar lista de seguidores' });
  }
});

// Get notifications for a user
app.get('/api/notifications/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(`
      SELECT n.*, u.name, u.username, u.profile_url
      FROM notifications n
      JOIN users u ON n.from_user_id = u.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 50
    `, [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Erro ao carregar notificações.' });
  }
});

// Mark notifications as read
app.put('/api/notifications/read/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );
    res.status(200).json({ message: 'Notificações marcadas como lidas.' });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ message: 'Erro ao atualizar notificações.' });
  }
});

// Get unread notification count
app.get('/api/notifications/unread/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    res.status(200).json({ count: rows[0].count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Erro ao contar notificações.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
