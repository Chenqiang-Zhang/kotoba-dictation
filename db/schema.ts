import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const catalog = sqliteTable('catalog', { id: text('id').primaryKey(), payload: text('payload').notNull() });
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const sessions = sqliteTable('sessions', { id: text('id').primaryKey(), userId: text('user_id').notNull(), day: text('day').notNull(), words: text('words').notNull(), progress: integer('progress').notNull().default(0), completed: integer('completed').notNull().default(0) });
export const gradeEvents = sqliteTable('grade_events', { id: text('id').primaryKey(), userId: text('user_id').notNull(), sessionId: text('session_id').notNull(), wordId: text('word_id').notNull(), attemptDay: text('attempt_day').notNull(), createdAt: text('created_at').notNull(), payload: text('payload').notNull() });
