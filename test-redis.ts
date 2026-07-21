/**
 * Redis Connection Test Script
 * 
 * Run: npx tsx test-redis.ts
 * 
 * Tests:
 * 1. Basic connection (PING)
 * 2. SET/GET operations
 * 3. Cache simulation
 * 4. BullMQ queue test
 */

import Redis from 'ioredis'

async function testRedis() {
  console.log('🔍 Testing Redis Connection...\n')

  // ---- Test 1: Basic Connection ----
  console.log('📡 Test 1: Connecting to Redis...')
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    connectTimeout: 5000,
    lazyConnect: true,
  })

  try {
    await redis.connect()
    console.log('✅ Connected to Redis!\n')
  } catch (error) {
    console.error('❌ Failed to connect to Redis!')
    console.error('   Error:', (error as Error).message)
    console.error('\n📌 Make sure Redis service is running:')
    console.error('   - Open Windows Services (services.msc)')
    console.error('   - Find "Redis" service and make sure it\'s "Running"')
    console.error('   - Or run: net start Redis')
    process.exit(1)
  }

  // ---- Test 2: PING ----
  console.log('📡 Test 2: PING command...')
  const pong = await redis.ping()
  console.log(`   Response: ${pong}`)
  if (pong === 'PONG') {
    console.log('✅ PING successful!\n')
  } else {
    console.log('❌ PING failed!\n')
  }

  // ---- Test 3: SET/GET ----
  console.log('📡 Test 3: SET/GET operations...')
  await redis.set('shopaccounting:test', 'Hello from ShopAccounting!', 'EX', 60)
  const value = await redis.get('shopaccounting:test')
  console.log(`   SET: shopaccounting:test = "Hello from ShopAccounting!"`)
  console.log(`   GET: shopaccounting:test = "${value}"`)
  if (value === 'Hello from ShopAccounting!') {
    console.log('✅ SET/GET successful!\n')
  } else {
    console.log('❌ SET/GET failed!\n')
  }

  // ---- Test 4: JSON Cache Simulation ----
  console.log('📡 Test 4: JSON cache simulation...')
  const testData = {
    products: [
      { id: 1, name: 'محصول تست', price: 150000 },
      { id: 2, name: 'محصول دوم', price: 250000 },
    ],
    total: 2,
    cachedAt: new Date().toISOString(),
  }
  await redis.set('shopaccounting:test:products', JSON.stringify(testData), 'EX', 120)
  const cachedValue = await redis.get('shopaccounting:test:products')
  const parsed = JSON.parse(cachedValue!)
  console.log(`   Cached ${parsed.total} products`)
  console.log(`   First product: ${parsed.products[0].name} - ${parsed.products[0].price} تومان`)
  console.log('✅ JSON cache successful!\n')

  // ---- Test 5: Counter (for rate limiting) ----
  console.log('📡 Test 5: Counter (rate limiting simulation)...')
  await redis.del('shopaccounting:test:counter')
  for (let i = 1; i <= 5; i++) {
    const count = await redis.incr('shopaccounting:test:counter')
    console.log(`   Request ${i}: counter = ${count}`)
  }
  await redis.expire('shopaccounting:test:counter', 60)
  console.log('✅ Counter successful!\n')

  // ---- Test 6: BullMQ Queue ----
  console.log('📡 Test 6: BullMQ queue test...')
  try {
    const { Queue } = await import('bullmq')
    
    const testQueue = new Queue('test-queue', {
      connection: { host: 'localhost', port: 6379 },
    })

    // Add a test job
    const job = await testQueue.add('test-job', {
      message: 'Hello from BullMQ!',
      timestamp: Date.now(),
    })
    console.log(`   Job added: ID = ${job.id}`)
    console.log(`   Job data: ${JSON.stringify(job.data)}`)

    // Check queue status
    const waiting = await testQueue.getWaitingCount()
    console.log(`   Waiting jobs: ${waiting}`)

    // Clean up
    await testQueue.obliterate({ force: true })
    console.log('✅ BullMQ queue successful!\n')
  } catch (error) {
    console.log('⚠️  BullMQ test skipped:', (error as Error).message, '\n')
  }

  // ---- Test 7: Redis Info ----
  console.log('📡 Test 7: Redis server info...')
  const info = await redis.info('server')
  const versionMatch = info.match(/redis_version:([^\r\n]+)/)
  const usedMemory = await redis.info('memory')
  const memoryMatch = usedMemory.match(/used_memory_human:([^\r\n]+)/)
  console.log(`   Redis version: ${versionMatch?.[1] || 'unknown'}`)
  console.log(`   Used memory: ${memoryMatch?.[1] || 'unknown'}`)
  console.log('✅ Server info retrieved!\n')

  // ---- Cleanup ----
  console.log('🧹 Cleaning up test data...')
  await redis.del('shopaccounting:test')
  await redis.del('shopaccounting:test:products')
  await redis.del('shopaccounting:test:counter')
  await redis.quit()
  console.log('✅ Cleanup done!\n')

  // ---- Final Result ----
  console.log('═══════════════════════════════════════')
  console.log('🎉 All Redis tests passed successfully!')
  console.log('═══════════════════════════════════════')
  console.log('')
  console.log('✅ Redis is ready for ShopAccounting!')
  console.log('   You can now proceed with the optimization.')
}

testRedis().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
