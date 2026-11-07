/**
 * AI 생성 모델(Higgsfield/Seedance/Seedream 등)의
 * 초상권 및 저작권 필터(Protected Content / Celebrity Likeness Filter)
 * 오탐지를 방지하기 위한 살균기(Sanitizer)
 */
export const sanitizePromptSafety = (text: string): string => {
  if (!text) return text;
  return text
    // 실사 얼굴 키워드로 인한 초상권 필터 오탐지 완화 (반실사 화풍 가이드라인)
    .replace(/realistic Korean faces/gi, 'stylized fictional Joseon character faces')
    // 실존 유명 연예인 풀네임이 유입된 경우 가상 인물로 일반화
    .replace(/김수현/g, '가상 선비')
    .replace(/Kim\s*Soo-?hyun/gi, 'fictional Joseon character')
    .replace(/아이유/g, '가상 여인')
    .replace(/\bIU\b/g, 'fictional Joseon woman')
    .replace(/차은우/g, '가상 선비')
    .replace(/Cha\s*Eun-?woo/gi, 'fictional Joseon character')
    .replace(/송중기/g, '가상 선비')
    .replace(/Song\s*Joong-?ki/gi, 'fictional Joseon character')
    .replace(/박보검/g, '가상 선비')
    .replace(/Park\s*Bo-?gum/gi, 'fictional Joseon character')
    .replace(/이민호/g, '가상 선비')
    .replace(/Lee\s*Min-?ho/gi, 'fictional Joseon character')
    .replace(/공유/g, '가상 선비')
    .replace(/Gong\s*Yoo/gi, 'fictional Joseon character');
};

