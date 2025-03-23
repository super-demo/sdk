// SuperApp TypeScript SDK

class SuperAppSDK {
  private apiKey: string
  private baseURL: string

  /**
   * Create a new SuperApp SDK instance
   * @param apiKey API key for authentication
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.baseURL = "" // Will be set during initialization
  }

  /**
   * Initialize the SDK by testing multiple possible URLs
   * @returns Promise resolving to the SDK instance
   */
  async initialize(): Promise<SuperAppSDK> {
    const urls = [
      "http://localhost:8080/v1/super",
      "http://host.docker.internal:8080/v1/super"
    ]

    // Test each URL
    for (const url of urls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)

        const response = await fetch(`${url}/list`, {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          console.log(`✅ Successfully connected to Super App at ${url}`)
          this.baseURL = url
          return this
        }
      } catch (error) {
        console.log(`❌ Could not connect to ${url}: ${error}`)
      }
    }

    // Default to localhost if none of the URLs worked
    console.warn("⚠️ Using default Super App URL, but connection not verified")
    this.baseURL = "http://localhost:8080/v1/super"
    return this
  }

  /**
   * Register a Mini-App with retry logic
   * @param appName Name of the mini-app
   * @param functions List of function names the mini-app provides
   * @param appURL Base URL where the mini-app can be reached
   * @returns Promise resolving when registration succeeds
   */
  async register(
    appName: string,
    functions: string[],
    appURL: string
  ): Promise<void> {
    // Make sure the URL doesn't end with a slash
    if (appURL.length > 0 && appURL.endsWith("/")) {
      appURL = appURL.slice(0, -1)
    }

    // Send my URL to the Super App
    const payload = {
      appName,
      functions,
      url: appURL
    }

    let lastError: Error | null = null

    // Try a few times in case the server is still starting up
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(`${this.baseURL}/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        })

        const responseText = await response.text()
        console.log(`Register response (attempt ${i + 1}): ${responseText}`)

        if (response.ok) {
          return
        }

        lastError = new Error(
          `Server returned non-OK status: ${response.status} - ${responseText}`
        )
      } catch (error) {
        console.log(`❌ Register attempt ${i + 1} failed: ${error}`)
        lastError = error instanceof Error ? error : new Error(String(error))
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw lastError
  }

  /**
   * Call another Mini-App's function
   * @param caller Name of the calling app
   * @param targetApp Name of the target app
   * @param functionName Name of the function to call
   * @param payload Data to send to the function
   * @returns Promise resolving to the function result
   */
  async callFunction(
    caller: string,
    targetApp: string,
    functionName: string,
    payload: Record<string, any>
  ): Promise<Record<string, any>> {
    const requestBody = {
      caller,
      targetApp,
      functionName,
      payload
    }

    console.log(
      `Calling ${targetApp}.${functionName} with payload:`,
      JSON.stringify(requestBody)
    )

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(`${this.baseURL}/call-function`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const responseText = await response.text()
      console.log(`Raw response from call-function: ${responseText}`)

      if (!response.ok) {
        throw new Error(
          `Server returned non-OK status: ${response.status} - ${responseText}`
        )
      }

      try {
        return JSON.parse(responseText)
      } catch (parseError) {
        throw new Error(`Error parsing response JSON: ${parseError}`)
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after 10 seconds`)
      }
      throw error
    }
  }

  /**
   * Factory method to create and initialize the SDK in one call
   * @param apiKey API key for authentication
   * @returns Promise resolving to initialized SDK
   */
  static async create(apiKey: string): Promise<SuperAppSDK> {
    const sdk = new SuperAppSDK(apiKey)
    return sdk.initialize()
  }
}

export default SuperAppSDK
