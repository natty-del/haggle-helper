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
    const { image, itemName, location, textOnly } = JSON.parse(event.body);

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
          hagglingTips: ["Check Vercel environment variables", "Ensure ANTHROPIC_API_KEY is set", "Redeploy the site"]
        })
      };
    }

    console.log('Making API request to Anthropic...');
    
    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    // Handle text-only requests (shopping list)
    if (textOnly && itemName) {
      console.log('Text-only request for:', itemName);
      
      try {
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
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: `Estimate the typical market price for "${itemName}" in ${location || 'Hanoi, Vietnam'}.
                
Return ONLY a JSON object with this exact format:
{
  "item": "${itemName}",
  "priceRange": {
    "min": <number>,
    "max": <number>,
    "currency": "VND"
  }
}

Use realistic Vietnamese market prices. Be accurate - this is for shopping budgets.`
              }
            ]
          })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Claude API error:', response.status, errorText);
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        console.log('Claude API response:', JSON.stringify(data).substring(0, 200));
        
        const text = data.content[0].text;
        
        // Parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log('Parsed result:', result);
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(result)
          };
        }
        
        console.error('Could not find JSON in response:', text);
        throw new Error('Could not parse price estimate');
      } catch (textOnlyError) {
        console.error('Text-only request failed:', textOnlyError);
        clearTimeout(timeoutId);
        
        // Return error response
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Text estimate failed',
            message: textOnlyError.message,
            item: itemName
          })
        };
      }
    }
    
    // Original image-based request
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
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search"
          }
        ],
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
                text: `VIETNAM PRICING REFERENCE (VinMart supermarket, Hanoi, March 2026):

FRUIT:
- King melon: 395,000 VND/kg | Cantaloupe: 105-120k each
- Grapes: 59k/kg | Watermelon: 44k/kg | Kumquats: 49k/pkg
- Apples (imported NZ/AU): 89-139k/kg
- Oranges: 59-86k/kg

VEGETABLES:
- Leafy greens: 5-9k/bunch | Mixed veg: 10-17k/bunch
- Ginger: 89k/kg | Garlic: 16-89k/kg | Shallots/Onions: 32-89k/kg
- Mushrooms: 59k/kg | Enoki: 83k/kg
- Broccoli/Cauliflower: 15-43k/head

PROTEIN & DAIRY:
- Tofu: 42-196k/kg | Cheese (imported): 460-484k/kg

STREET MARKET PRICING:
- Fresh produce: VinMart ÷ 2.2 to 2.5
- Standard fruit: VinMart ÷ 2.0
- Imported items: VinMart ÷ 1.5 to 1.8

I'm at a market in ${location}. Analyze this item:

1. What is it?
2. Use pricing reference above (if relevant) OR search web
3. Give fair street price range in local currency
4. Suggest starting offer
5. Give 2 SHORT haggling tips (under 50 chars each)
6. Rate confidence

Respond ONLY with valid JSON:
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
          description: `API returned ${response.status}. ${response.status === 401 ? 'Check API key.' : 'Please try again.'}`,
          confidence: "low",
          hagglingTips: ["Try scanning again", "Check your connection", "Contact support if this persists"]
        })
      };
    }

    const data = await response.json();
    console.log('Got response from Anthropic');
    
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
    
    // Check if it was a timeout
    if (error.name === 'AbortError') {
      return {
        statusCode: 504,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          item: "Request Timeout",
          description: "Analysis took too long. Please try again.",
          confidence: "low",
          hagglingTips: ["Try scanning again", "Ensure good internet connection", "Take a clearer photo"]
        })
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        item: "Error",
        description: error.message || "Could not analyze. Please try again.",
        confidence: "low",
        hagglingTips: ["Take clearer photo", "Ensure good lighting", "Try again"]
      })
    };
  }
};
