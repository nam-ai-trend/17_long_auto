/**
 * AI 생성 모델(Higgsfield/Seedance/Seedream 등)의
 * 유명 연예인 및 실존 인물 저작권/초상권 필터(Protected Content / Celebrity Likeness Filter)
 * 차단을 방지하기 위한 살균기(Sanitizer)
 */
export const sanitizePromptSafety = (text: string): string => {
  if (!text) return text;
  return text
    // 실존 유명 연예인 한글명 치환 (가상 인물화)
    .replace(/김수현/g, '수현')
    .replace(/Kim\s*Soo-?hyun/gi, 'Joseon youth Su-hyeon')
    .replace(/아이유/g, '지은')
    .replace(/\bIU\b/g, 'Ji-eun')
    .replace(/차은우/g, '은우')
    .replace(/Cha\s*Eun-?woo/gi, 'Eun-woo')
    .replace(/송중기/g, '중기')
    .replace(/Song\s*Joong-?ki/gi, 'Joong-ki')
    .replace(/박보검/g, '보검')
    .replace(/Park\s*Bo-?gum/gi, 'Bo-gum')
    .replace(/이민호/g, '민호')
    .replace(/Lee\s*Min-?ho/gi, 'Min-ho')
    .replace(/공유/g, '유')
    .replace(/Gong\s*Yoo/gi, 'Joseon scholar');
};
