-- =============================================
-- ArquivosGTA - Schema Completo do Banco de Dados
-- Versão: 2.0 (com suporte a múltiplas mídias)
-- Execute este script no phpMyAdmin da Hostinger
-- =============================================

CREATE DATABASE IF NOT EXISTS arquivosgta_db 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE arquivosgta_db;

-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL UNIQUE,
  identifier VARCHAR(255) NOT NULL UNIQUE,  -- email
  password VARCHAR(255) NOT NULL,
  birth_date DATE,
  profile_url VARCHAR(255) DEFAULT NULL,
  cover_url VARCHAR(255) DEFAULT NULL,
  accepted_terms TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Posts
CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  content TEXT,
  media_url VARCHAR(255) DEFAULT NULL,   -- legado (mantido para compatibilidade)
  media_type ENUM('image', 'video') DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela de Mídias dos Posts (suporte a múltiplas fotos/vídeos por post)
CREATE TABLE IF NOT EXISTS post_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  media_url VARCHAR(255) NOT NULL,
  media_type VARCHAR(50) NOT NULL,   -- 'image' ou 'video'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Tabela de Curtidas (Likes)
CREATE TABLE IF NOT EXISTS post_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_like (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela de Seguidores
CREATE TABLE IF NOT EXISTS follows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_follow (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,           -- quem RECEBE a notificação
  type VARCHAR(50) NOT NULL,      -- 'follow', 'unfollow', 'like', 'comment'
  from_user_id INT NOT NULL,      -- quem GEROU a notificação
  post_id INT DEFAULT NULL,       -- opcional: post relacionado
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Tabela de Denúncias
CREATE TABLE IF NOT EXISTS post_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  reporter_id INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);
