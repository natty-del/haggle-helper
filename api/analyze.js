export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, location } = req.body;

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        item: "Configuration Error",
        description: "API key not configured",
        confidence: "low",
        hagglingTips: ["Check environment variables"]
      });
    }

    // Call Anthropic API
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
- Grapes: 59k/kg | Watermelon: 44k/kg
- Apples (imported): 89-139k/kg

VEGETABLES:
- Leafy greens: 5-9k/bunch | Ginger: 89k/kg
- Garlic: 16-89k/kg | Shallots: 32-89k/kg

PROTEIN & DAIRY:
- Tofu: 42-196k/kg | Cheese: 460-484k/kg

STREET MARKET PRICING:
- Fresh produce: VinMart ÷ 2.2 to 2.5
- Standard fruit: VinMart ÷ 2.0
- Imported items: VinMart ÷ 1.5 to 1.8

I'm at a market in ${location}. Analyze this item and give fair street price.

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
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({
        item: "API Error",
        description: `API returned ${response.status}`,
        confidence: "low",
        hagglingTips: ["Try scanning again"]
      });
    }

    const data = await response.json();
    
    // Extract text from response
    const textContent = data.content
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n");

    // Parse JSON
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse response");
    }

    const result = JSON.parse(jsonMatch[0]);

    return res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      item: "Error",
      description: error.message || "Could not analyze",
      confidence: "low",
      hagglingTips: ["Take clearer photo", "Try again"]
    });
  }
}
