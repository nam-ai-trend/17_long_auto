import {join} from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import express from 'express';
import {ZodError} from 'zod';
import {createRoutes} from './routes';
import {
  qwenTtsProvider,
  storyProvider as defaultStoryProvider,
} from './providers';
import type {StoryProvider, TtsProvider, VisualProvider} from './providers';
import {higgsfieldProvider} from './higgsfield-provider';

type CreateAppOptions = {
  database: DatabaseSync;
  assetRoot?: string;
  ttsProvider?: TtsProvider;
  storyProvider?: StoryProvider;
  visualProvider?: VisualProvider;
};

export const createApp = ({
  database,
  assetRoot = join(process.cwd(), 'projects'),
  ttsProvider = qwenTtsProvider,
  storyProvider = defaultStoryProvider,
  visualProvider = higgsfieldProvider,
}: CreateAppOptions) => {
  const app = express();
  app.use(express.json({limit: '8mb'}));
  app.use('/api', createRoutes(database, assetRoot, ttsProvider, storyProvider, visualProvider));
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        response.status(400).json({error: '입력값을 확인해 주세요.', issues: error.issues});
        return;
      }
      response.status(400).json({
        error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.',
      });
    },
  );
  return app;
};
