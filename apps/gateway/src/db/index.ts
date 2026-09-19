import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { config } from '../config/index.js'
import * as schema from './schema/index.js'

const pool = new Pool(config.database)

export const db = drizzle(pool, { schema })
export { schema }
