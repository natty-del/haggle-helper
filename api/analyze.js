exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { image, location } = JSON.parse(event.body);

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          item: "Configuration Error",
          description: "API key not configured",
          confidence: "low",
          hagglingTips: ["Check environment variables"]
        })
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image }},
            { type: "text", text: `I'm at a market in ${location}. Analyze this item and give fair street price. Respond ONLY with JSON: {"item": "name", "description": "desc", "priceRange": {"min": number, "max": number, "currency": "VND"}, "suggestedStartingOffer": number, "confidence": "high/medium/low", "hagglingTips": ["tip1", "tip2"]}` }
          ]
        }]
      })
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ item: "API Error", description: "Try again", confidence: "low", hagglingTips: ["Scan again"] })
      };
    }

    const data = await response.json();
    const textContent = data.content.filter(item => item.type === "text").map(item => item.text).join("\n");
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ item: "Error", description: error.message, confidence: "low", hagglingTips: ["Try again"] })
    };
  }
};
