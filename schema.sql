-- schema.sql
-- Run: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS campus_events CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campus_events;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','student') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  max_participants INT UNSIGNED NOT NULL DEFAULT 100,
  image_url VARCHAR(1000),
  status ENUM('upcoming','past') NOT NULL DEFAULT 'upcoming',
  registered_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX (category),
  INDEX (status),
  INDEX (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registrations table
CREATE TABLE IF NOT EXISTS registrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_event (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  INDEX (event_id),
  INDEX (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional sample events:
INSERT INTO events (title, description, date, time, location, category, max_participants, image_url, status)
VALUES
('Tech Talk: Modern Web', 'A talk about modern web architecture and tooling.', DATE_ADD(CURDATE(), INTERVAL 7 DAY), '17:00:00', 'Auditorium A', 'Technology', 150, 'https://placehold.co/1200x400', 'upcoming'),
('Cultural Night', 'Celebrate music, dance and food from our community', DATE_ADD(CURDATE(), INTERVAL 14 DAY), '19:00:00', 'Main Lawn', 'Cultural', 500, 'https://placehold.co/1200x400', 'upcoming');
