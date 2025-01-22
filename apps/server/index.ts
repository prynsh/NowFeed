import express from 'express';
import { WebSocketServer } from 'ws';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { scrapeHackerNews } from './services/scraper';
import { subMinutes } from 'date-fns'; 

const app = express();
const prisma = new PrismaClient();

let httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', async (ws) => {
  console.log('Client connected');

  const getInitialData = async () => {
    try {
      await scrapeHackerNews();

      const fiveMinutesAgo = subMinutes(new Date(), 5);
      const recentArticles = await prisma.article.findMany({
        where: {
          publishedAt: {
            gte: fiveMinutesAgo,
          },
        },
        orderBy: {
          publishedAt: 'desc'
        },
      });

      console.log(`Initial count of articles from last 5 minutes: ${recentArticles.length}`);
    
      ws.send(JSON.stringify({
        type: 'initialData',
        recentArticles: recentArticles,
        recentArticlesCount: recentArticles.length,
      }));
    } catch (error) {
      console.error('Error getting initial data:', error);
    }
  };

  const sendArticleUpdates = async () => {
    try {
      const articles = await scrapeHackerNews();
      
      if (!articles || articles.length === 0) {
        console.log('No new articles to send.');
        return;
      }

      const fiveMinutesAgo = subMinutes(new Date(), 5);
      const recentArticles = await prisma.article.findMany({
        where: {
          publishedAt: {
            gte: fiveMinutesAgo,
          },
        },
        orderBy: {
          publishedAt: 'desc'
        },
      });

      ws.send(JSON.stringify({
        type: 'articleUpdate',
        articles: recentArticles,
      }));

    } catch (error) {
      console.error('Error sending article updates:', error);
    }
  };

  await getInitialData();

  const interval = setInterval(sendArticleUpdates, 300000); 
  sendArticleUpdates(); 

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(interval);
  });
});

app.get('/status', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'WebSocket server is running on ws://localhost:3001' 
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});