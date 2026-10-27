// Plain-text and HTML email bodies (inline styles only: many mail clients drop <style>).

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailSpec {
  title: string;
  summary: string;
  reason?: string | undefined;
  nextStep: string;
  action: { label: string; url: string };
}

// Colours of the web app palette (Frontend/src/styles/palette.ts).
const colors = {
  primary: '#2f7d6d',
  danger: '#d64545',
  dangerSoft: '#fdecec',
  text: '#1f2933',
  muted: '#616e7c',
  border: '#d9e2ec',
  background: '#f5f7fa',
} as const;

const paragraph = 'margin:0 0 12px;font-size:15px;line-height:1.6';
const footer = 'Email này được gửi tự động từ ToyFlow, vui lòng không trả lời.';

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderText = (spec: EmailSpec): string =>
  [
    'Chào bạn,',
    spec.summary,
    ...(spec.reason ? [`Lý do: ${spec.reason}`] : []),
    spec.nextStep,
    `${spec.action.label}: ${spec.action.url}`,
    'Trân trọng,\nĐội ngũ ToyFlow',
    footer,
  ].join('\n\n');

const renderHtml = (spec: EmailSpec): string => {
  const url = escapeHtml(spec.action.url);
  return [
    `<div style="margin:0;padding:24px;background-color:${colors.background};font-family:Arial,Helvetica,sans-serif;color:${colors.text}">`,
    `<div style="max-width:560px;margin:0 auto;padding:24px;background-color:#ffffff;border:1px solid ${colors.border};border-radius:8px">`,
    `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${colors.primary}">ToyFlow</p>`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.4">${escapeHtml(spec.title)}</h1>`,
    `<p style="${paragraph}">Chào bạn,</p>`,
    `<p style="${paragraph}">${escapeHtml(spec.summary)}</p>`,
    spec.reason
      ? `<p style="${paragraph};padding:12px 16px;background-color:${colors.dangerSoft};border-left:4px solid ${colors.danger}"><strong>Lý do:</strong> ${escapeHtml(spec.reason)}</p>`
      : '',
    `<p style="${paragraph}">${escapeHtml(spec.nextStep)}</p>`,
    `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:10px 20px;background-color:${colors.primary};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">${escapeHtml(spec.action.label)}</a></p>`,
    `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${colors.muted}">Nếu nút trên không hoạt động, hãy mở liên kết: <a href="${url}" style="color:${colors.primary}">${url}</a></p>`,
    `<p style="${paragraph}">Trân trọng,<br>Đội ngũ ToyFlow</p>`,
    `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${colors.border};font-size:12px;line-height:1.5;color:${colors.muted}">${footer}</p>`,
    '</div></div>',
  ].join('');
};

export const renderEmail = (spec: EmailSpec): EmailContent => ({
  subject: `[ToyFlow] ${spec.title}`,
  text: renderText(spec),
  html: renderHtml(spec),
});
