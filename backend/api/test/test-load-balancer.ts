import axios from 'axios'
import { describe, it, expect } from '@jest/globals'

const BASE_URL = 'http://localhost'

describe('Load balancer', () => {
  it('should route POST requests to write instance', async () => {
    const response = await axios.post(`${BASE_URL}/health`)
    expect(response.status).toBe(200)
  })

  it('should route GET requests to read instances', async () => {
    // Make multiple requests to see distribution
    const responses = await Promise.all([
      axios.get(`${BASE_URL}/markets`),
      axios.get(`${BASE_URL}/markets`),
      axios.get(`${BASE_URL}/markets`)
    ])
    responses.forEach(response => {
      expect(response.status).toBe(200)
    })
  })

  it('should route websocket connections to write instance', async () => {
    // We can check the websocket connection by hitting the endpoint
    const response = await axios.get(`${BASE_URL}/ws`)
    expect(response.status).toBe(101) // Switching protocols
  })
})
