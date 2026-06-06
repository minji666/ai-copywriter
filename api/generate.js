// Vercel Serverless Function
// 这个文件用于部署到 Vercel，本地开发使用 server.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { platform, topic, keywords, style } = req.body;

  if (!platform || !topic) {
    return res.status(400).json({ error: '请填写平台和主题' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务器未配置 API Key' });
  }

  try {
    const platformGuides = {
      xhs: '小红书风格：使用emoji分段，语气亲切自然，像朋友分享，重点在实用价值和种草感，#标签结尾',
      gzh: '公众号风格：标题要有吸引力和信息增量，正文结构清晰有深度，适合中长篇阅读',
      douyin: '抖音风格：开头要有钩子抓住注意力，节奏快，口语化，适合短视频口播文案',
      pyq: '朋友圈风格：像日常分享，轻松随意，带点个人生活气息，不需要太正式',
    };

    const styleGuide = platformGuides[platform] || platformGuides.xhs;
    const styleExtra = style ? `\n额外要求：${style}` : '';

    const prompt = `请为以下内容生成3个不同风格的爆款文案：

平台：${platform === 'xhs' ? '小红书' : platform === 'gzh' ? '公众号' : platform === 'douyin' ? '抖音' : '朋友圈'}
主题：${topic}
关键词：${keywords || '无'}
${styleExtra}

要求：
1. ${styleGuide}
2. 生成3个版本，分别标注【版本一】【版本二】【版本三】
3. 每个版本包含标题和正文
4. 适当使用emoji增加吸引力
5. 控制每个版本在200字以内`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的中文文案撰写专家，擅长写小红书、公众号、抖音等平台的爆款文案。你的文案生动有趣，善于使用emoji，懂得各平台的写作风格和流量密码。每次返回恰好3个不同风格的文案版本。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `AI 调用失败: ${errText}` });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Vercel 上简单计数（内存中，实例重启会清空）
    return res.json({
      success: true,
      content: content,
      remaining: 'N/A',
      limit: 3,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
