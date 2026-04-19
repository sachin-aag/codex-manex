export const OPEN_INSIGHTS_CHAT_EVENT = "qontrol:open-insights-chat";

export function openInsightsChat() {
  window.dispatchEvent(new CustomEvent(OPEN_INSIGHTS_CHAT_EVENT));
}
