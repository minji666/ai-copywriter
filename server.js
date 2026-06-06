const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 简单的内存存储，记录每个IP的使用次数（生产环境建议用数据库）
const usageTracker = new Map();

// 每个IP免费试用次数
const FREE_TRIAL_LIMIT = 3;

// DeepSeek API 调用
async function callDeepSeek(prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    throw new Error('请先配置 DEEPSEEK_API_KEY 环境变量');
  }

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
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API 调用失败: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// API 路由：生成文案
app.post('/api/generate', async (req, res) => {
  try {
    const { platform, topic, keywords, style } = req.body;

    if (!platform || !topic) {
      return res.status(400).json({ error: '请填写平台和主题' });
    }

    // 获取客户端IP（简单实现）
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // 检查使用次数
    let usage = usageTracker.get(ip) || 0;
    const isPaid = req.body.paid === true;

    if (!isPaid && usage >= FREE_TRIAL_LIMIT) {
      return res.status(402).json({
        error: 'free_limit_reached',
        message: `免费试用次数已用完（${FREE_TRIAL_LIMIT}次）。请升级为付费用户继续使用。`,
        usage: usage,
        limit: FREE_TRIAL_LIMIT,
      });
    }

    // 构建 prompt
    const platformGuides = {
      'xhs': '小红书风格：使用emoji分段，语气亲切自然，像朋友分享，重点在实用价值和种草感，#标签结尾',
      'gzh': '公众号风格：标题要有吸引力和信息增量，正文结构清晰有深度，适合中长篇阅读',
      'douyin': '抖音风格：开头要有钩子抓住注意力，节奏快，口语化，适合短视频口播文案',
      'pyq': '朋友圈风格：像日常分享，轻松随意，带点个人生活气息，不需要太正式',
    };

    const styleGuide = platformGuides[platform] || platformGuides['xhs'];
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

    // 调用 AI
    const result = await callDeepSeek(prompt);

    // 更新使用次数
    if (!isPaid) {
      usageTracker.set(ip, usage + 1);
    }

    res.json({
      success: true,
      content: result,
      usage: isPaid ? usage : usage + 1,
      remaining: isPaid ? '无限' : Math.max(0, FREE_TRIAL_LIMIT - (usage + 1)),
      limit: FREE_TRIAL_LIMIT,
    });
  } catch (err) {
    console.error('生成失败:', err.message);
    res.status(500).json({
      error: 'generation_failed',
      message: err.message || '生成失败，请稍后重试',
    });
  }
});

// 查询剩余次数
app.get('/api/usage', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const usage = usageTracker.get(ip) || 0;
  res.json({
    usage: usage,
    remaining: Math.max(0, FREE_TRIAL_LIMIT - usage),
    limit: FREE_TRIAL_LIMIT,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 AI文案生成器已启动: http://localhost:${PORT}`);
  console.log(`📝 每个IP免费试用 ${FREE_TRIAL_LIMIT} 次`);
  console.log(`💡 请先配置 .env 文件中的 DEEPSEEK_API_KEY`);
});
