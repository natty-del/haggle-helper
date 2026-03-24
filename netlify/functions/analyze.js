exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { image, location } = JSON.parse(event.body);

    // Check if API key exists
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not found in environment variables');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          item: "Configuration Error",
          description: "API key not configured. Please contact support.",
          confidence: "low",
          hagglingTips: ["Check environment variables", "Ensure ANTHROPIC_API_KEY is set", "Redeploy the site"]
        })
      };
    }

    console.log('Making API request to Anthropic...');
    
    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image
                }
              },
              {
                type: "text",
                text: `I'm at a market in ${location}. Analyze this item and give fair street price range in local currency. Respond ONLY with valid JSON:
{
  "item": "item name",
  "description": "brief description",
  "priceRange": {"min": number, "max": number, "currency": "VND"},
  "suggestedStartingOffer": number,
  "confidence": "high/medium/low",
  "hagglingTips": ["tip1", "tip2"]
}`
              }
            ]
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      
      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          item: "API Error",
          description: `API returned ${response.status}`,
          confidence: "low",
          hagglingTips: ["Try scanning again", "Check your connection"]
        })
      };
    }

    const data = await response.json();
    
    // Extract text from response
    const textContent = data.content
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n");

    // Parse JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse response");
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        item: "Error",
        description: error.message || "Could not analyze",
        confidence: "low",
        hagglingTips: ["Take clearer photo", "Try again"]
      })
    };
  }
};
