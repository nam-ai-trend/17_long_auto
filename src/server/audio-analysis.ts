import {execFile} from 'node:child_process';

type SilenceBoundary = {leading: number; trailing: number};
type AudioAnalysis = SilenceBoundary & {duration: number};

const round = (value: number) => Number(value.toFixed(3));

export const parseFfprobeDuration = (output: string): number => {
  const parsed = JSON.parse(output) as {format?: {duration?: string | number}};
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('FFprobe 결과에서 오디오 길이를 읽지 못했습니다.');
  }
  return round(duration);
};

export const parseSilenceBoundaries = (output: string, duration: number): SilenceBoundary => {
  const starts = [...output.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const ends = [...output.matchAll(/silence_end:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  let leading = 0;
  let trailing = 0;

  if (starts[0] !== undefined && starts[0] <= 0.02 && ends[0] !== undefined) {
    leading = ends[0];
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = ends[index];
    if (end !== undefined && Math.abs(end - duration) <= 0.05) trailing = duration - start;
  }
  return {leading: round(Math.max(0, leading)), trailing: round(Math.max(0, trailing))};
};

export const additionalGapAfterTrailingSilence = (
  targetGap: number,
  trailingSilence: number,
): number => round(Math.max(0, targetGap - trailingSilence));

const run = (command: string, args: string[]): Promise<{stdout: string; stderr: string}> =>
  new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} 실행 실패: ${stderr || error.message}`));
        return;
      }
      resolve({stdout, stderr});
    });
  });

export const analyzeAudio = async (
  path: string,
  tools: {ffprobe?: string; ffmpeg?: string} = {},
): Promise<AudioAnalysis> => {
  const probe = await run(tools.ffprobe ?? process.env.FFPROBE_PATH ?? 'ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    path,
  ]);
  const duration = parseFfprobeDuration(probe.stdout);
  const silence = await run(tools.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-hide_banner',
    '-i',
    path,
    '-af',
    'silencedetect=noise=-42dB:d=0.08',
    '-f',
    'null',
    '-',
  ]);
  return {duration, ...parseSilenceBoundaries(silence.stderr, duration)};
};
