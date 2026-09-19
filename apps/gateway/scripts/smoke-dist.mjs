process.env.NODE_ENV = 'production'
process.env.ADMIN_TOKEN = 'smoke-test-admin-token'
process.env.MODEL_ENCRYPTION_KEY = 'smoke-test-encryption-key'

const { default: app } = await import('../dist/app.js')
const response = await app.request('/does-not-exist')

if (response.status !== 404) {
  throw new Error(`Expected built app to return 404, received ${response.status}`)
}

process.stdout.write('Built gateway imports and handles requests successfully.\n')
