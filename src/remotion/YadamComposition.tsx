import type {Caption} from '@remotion/captions';
import {AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import type {MediaSegment, NarrationCue} from '../shared/contracts';
import {toCaptions} from './model';

export type MediaAsset = {
  type: 'video' | 'still';
  url: string;
  label?: string;
};

export type YadamCompositionProps = {
  title: string;
  cues: Array<NarrationCue & {audioUrl?: string | null}>;
  segments: MediaSegment[];
  mediaAssets?: Record<string, MediaAsset>;
};

const CaptionLayer = ({captions, timeMs}: {captions: Caption[]; timeMs: number}) => {
  const current = captions.find((caption) => timeMs >= caption.startMs && timeMs < caption.endMs);
  if (!current) return null;
  return (
    <div style={{position: 'absolute', left: 300, right: 300, bottom: 92, display: 'flex', justifyContent: 'center', zIndex: 20}}>
      <div style={{maxWidth: 1260, padding: '18px 28px', borderRadius: 18, color: '#fffaf2', backgroundColor: 'rgba(20,17,14,.78)', fontFamily: 'Pretendard, Apple SD Gothic Neo, sans-serif', fontSize: 44, fontWeight: 700, lineHeight: 1.4, textAlign: 'center', boxShadow: '0 14px 40px rgba(0,0,0,.18)'}}>
        {current.text}
      </div>
    </div>
  );
};

const PaintedPlaceholder = ({
  isVideo,
  label,
  isFirst = false,
}: {
  isVideo: boolean;
  label: string;
  isFirst?: boolean;
}) => {
  const frame = useCurrentFrame();
  const transitionFrames = 15;
  const opacity = isFirst
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity, backgroundColor: isVideo ? '#29363b' : '#80705d'}}>
      <AbsoluteFill style={{background: isVideo ? 'radial-gradient(circle at 65% 22%, #99a9aa 0%, #475c60 27%, #1d292e 78%)' : 'radial-gradient(circle at 67% 21%, #e2c08d 0%, #9c7c59 31%, #493e34 82%)'}} />
      <div style={{position: 'absolute', left: -120, right: -120, bottom: -70, height: 520, borderRadius: '48% 52% 0 0', backgroundColor: isVideo ? '#1c2c31' : '#403a31', opacity: .88}} />
      <div style={{position: 'absolute', right: 310, bottom: 180, width: 260, height: 570, borderRadius: '48% 48% 30% 30%', backgroundColor: isVideo ? '#6c1f22' : '#8b3528', boxShadow: '0 34px 70px rgba(0,0,0,.28)'}} />
      <div style={{position: 'absolute', right: 342, bottom: 660, width: 196, height: 196, borderRadius: '50%', backgroundColor: '#d2ab84', boxShadow: 'inset -28px -14px 0 rgba(90,54,39,.18)'}} />
      <div style={{position: 'absolute', right: 96, top: 82, padding: '13px 18px', borderRadius: 999, color: '#fff8ef', backgroundColor: 'rgba(22,19,16,.44)', fontFamily: 'Pretendard, Apple SD Gothic Neo, sans-serif', fontSize: 22, letterSpacing: 2}}>{label}</div>
    </AbsoluteFill>
  );
};

const VideoClip = ({
  src,
  label,
  durationInFrames,
  targetDurationSeconds,
  isFirst,
}: {
  src: string;
  label: string;
  durationInFrames: number;
  targetDurationSeconds: number;
  isFirst: boolean;
}) => {
  const frame = useCurrentFrame();
  const transitionFrames = 15; // 0.5초 크로스페이드

  // Seedance AI 비디오 원본 길이(약 5.056초)를 실제 나레이션 대사 길이에 맞게 가변 조절
  // 대사가 길면 여유로운 슬로우 모션(0.6x~), 짧으면 경쾌한 배속(1.2x~)으로 대사 끝까지 모션 지속
  const videoSourceDuration = 5.056;
  const playbackRate = targetDurationSeconds > 0
    ? Math.max(0.4, Math.min(2.0, Number((videoSourceDuration / targetDurationSeconds).toFixed(3))))
    : 1.0;

  // 이전 클립 위에 새로 들어오는 클립이 0 -> 1로 덮임 (배경 암전 딥 없이 부드러운 디졸브)
  const opacity = isFirst
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });

  // 시네마틱 줌인 & 미세 패닝 (카메라가 살아 숨쉬는 역동적 깊이감)
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });
  const translateY = interpolate(frame, [0, durationInFrames], [0, -10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate3d(0px, ${translateY}px, 0px)`,
          transformOrigin: 'center center',
        }}
      >
        <OffthreadVideo
          src={src}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
          playbackRate={playbackRate}
          volume={0}
        />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          right: 96,
          top: 82,
          padding: '13px 20px',
          borderRadius: 999,
          color: '#fff8ef',
          backgroundColor: 'rgba(22,19,16,.65)',
          fontFamily: 'Pretendard, Apple SD Gothic Neo, sans-serif',
          fontSize: 22,
          letterSpacing: 1.5,
          backdropFilter: 'blur(8px)',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

const PhotoMotionStill = ({
  src,
  label,
  durationInFrames,
  isFirst,
}: {
  src: string;
  label: string;
  durationInFrames: number;
  isFirst: boolean;
}) => {
  const frame = useCurrentFrame();
  const transitionFrames = 15;

  // 오버레이 페이드인
  const opacity = isFirst
    ? 1
    : interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });

  const progress = durationInFrames > 0 ? frame / durationInFrames : 0;
  const scale = interpolate(progress, [0, 1], [1.02, 1.14], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  });

  const translateX = interpolate(progress, [0, 0.5, 1], [-10, 12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{overflow: 'hidden', opacity}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate3d(${translateX}px, 0px, 0px)`,
          transformOrigin: 'center center',
        }}
      >
        <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          right: 96,
          top: 82,
          padding: '13px 20px',
          borderRadius: 999,
          color: '#fff8ef',
          backgroundColor: 'rgba(22,19,16,.65)',
          fontFamily: 'Pretendard, Apple SD Gothic Neo, sans-serif',
          fontSize: 22,
          letterSpacing: 1.5,
          backdropFilter: 'blur(8px)',
        }}
      >
        🎨 {label}
      </div>
    </AbsoluteFill>
  );
};

export const YadamComposition = ({
  title,
  cues,
  segments,
  mediaAssets = {},
}: YadamCompositionProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  const captions = toCaptions(cues);

  return (
    <AbsoluteFill style={{backgroundColor: '#191613'}}>
      {/* 타임라인 세그먼트별 실제 비디오 및 이미지 시퀀스 */}
      {segments.map((seg, index) => {
        const asset =
          mediaAssets[seg.id] ??
          (seg.sceneDataId ? mediaAssets[seg.sceneDataId] : undefined);

        const targetDuration = Math.max(0.1, seg.end - seg.start);
        const transitionFrames = 15;
        const isFirst = index === 0;
        const isLast = index === segments.length - 1;

        // 크로스페이드 오버랩을 위해 다음 세그먼트와 15프레임(0.5초) 겹침
        const from = Math.round(seg.start * fps);
        const duration = Math.max(
          1,
          Math.round(targetDuration * fps) + (isLast ? 0 : transitionFrames),
        );

        return (
          <Sequence
            key={seg.id}
            from={from}
            durationInFrames={duration}
            style={{zIndex: index}}
          >
            {asset?.type === 'video' ? (
              <VideoClip
                src={asset.url}
                label={`🎬 도입 영상 #${seg.id.replace('intro-', '')}`}
                durationInFrames={duration}
                targetDurationSeconds={targetDuration}
                isFirst={isFirst}
              />
            ) : asset?.type === 'still' ? (
              <PhotoMotionStill
                src={asset.url}
                label={asset.label ?? '조선 수묵채색 삽화'}
                durationInFrames={duration}
                isFirst={isFirst}
              />
            ) : (
              <PaintedPlaceholder
                isVideo={seg.type === 'video'}
                label={
                  seg.type === 'video'
                    ? `도입 영상 #${seg.id.replace('intro-', '')} · 생성 대기`
                    : seg.parallaxEnabled
                      ? '반실사 삽화 · 2.5D 추천'
                      : '반실사 삽화 · 2D 포토 모션'
                }
                isFirst={isFirst}
              />
            )}
          </Sequence>
        );
      })}

      <div
        style={{
          position: 'absolute',
          top: 78,
          left: 92,
          color: '#fff8ef',
          fontFamily: 'Georgia, serif',
          fontSize: 35,
          textShadow: '0 3px 18px rgba(0,0,0,.35)',
          zIndex: 10,
        }}
      >
        {title}
      </div>

      {/* Qwen3 TTS 한국어 내레이션 음성 트랙 */}
      {cues.map((cue) => {
        if (!cue.audioUrl) return null;
        const from = Math.round(cue.start * fps);
        const duration = Math.max(1, Math.round((cue.end - cue.start) * fps));

        return (
          <Sequence key={`audio-${cue.id}`} from={from} durationInFrames={duration}>
            <Audio src={cue.audioUrl} />
          </Sequence>
        );
      })}

      <CaptionLayer captions={captions} timeMs={time * 1000} />
    </AbsoluteFill>
  );
};
