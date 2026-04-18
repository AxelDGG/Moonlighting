import { api } from '../api.js';
import { esc, mdToHtml } from '../utils.js';
import { toast } from '../ui.js';
import { refreshIcons } from '../icons.js';

let chatHistory = [];

const SUGGESTIONS = [
  '¿Qué pedidos tengo hoy?',
  '¿Cuánto he vendido hoy?',
  '¿Qué hay en inventario?',
  '¿Cuántos pedidos están pendientes?',
];

function formatTime() {
  return new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Monterrey' });
}

function renderMessages() {
  const container = document.getElementById('chat-msgs');
  if (!container) return;

  if (chatHistory.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon"><i data-lucide="bot"></i></div>
        <p>Hola, soy tu asistente de Moonlighting.<br>Pregúntame sobre inventario, pedidos o ventas.</p>
        <div class="chat-suggestions">
          ${SUGGESTIONS.map(s => `<button class="chat-chip" onclick="sendChatMsg(${JSON.stringify(s)})">${esc(s)}</button>`).join('')}
        </div>
      </div>`;
    refreshIcons(container);
    return;
  }

  container.innerHTML = chatHistory.map(msg => {
    const isUser = msg.role === 'user';
    const bubbleContent = isUser
      ? `<span>${esc(msg.content)}</span>`
      : `<div class="chat-md">${mdToHtml(msg.content)}</div>`;
    return `
      <div class="chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-bot'}">
        ${!isUser ? '<div class="chat-avatar"><i data-lucide="bot"></i></div>' : ''}
        <div class="chat-bubble">
          ${bubbleContent}
          <div class="chat-time">${esc(msg.time || '')}</div>
        </div>
        ${isUser ? '<div class="chat-avatar chat-avatar-user"><i data-lucide="user"></i></div>' : ''}
      </div>`;
  }).join('');

  refreshIcons(container);
  container.scrollTop = container.scrollHeight;
}

export function renderChatbot() {
  const tab = document.getElementById('tab-asistente');
  if (!tab || tab.querySelector('#chat-msgs')) return;

  tab.innerHTML = `
    <div class="card chat-card">
      <div class="ch">
        <div style="display:flex;align-items:center;gap:8px">
          <i data-lucide="bot" style="width:18px;height:18px;color:var(--p)"></i>
          <h2>Asistente IA</h2>
        </div>
        <button class="btn bg bsm" onclick="clearChat()" title="Limpiar conversación">
          <i data-lucide="trash-2" style="width:13px;height:13px"></i> Limpiar
        </button>
      </div>
      <div class="chat-msgs-wrap">
        <div id="chat-msgs"></div>
        <div id="chat-typing" class="chat-typing" style="display:none">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="chat-input-row">
        <input id="chat-input" class="chat-input" placeholder="Ej: ¿Cuántos abanicos quedan en bodega?"
          onkeydown="chatKeydown(event)" autocomplete="off" maxlength="500"/>
        <button class="btn bp" id="btn-chat-send" onclick="sendChatMsg()">
          <i data-lucide="send" style="width:14px;height:14px"></i>
        </button>
      </div>
    </div>`;

  refreshIcons(tab);
  renderMessages();
}

export async function sendChatMsg(preset) {
  const input = document.getElementById('chat-input');
  const text = typeof preset === 'string' ? preset : input?.value.trim();
  if (!text) return;

  if (input) input.value = '';

  chatHistory.push({ role: 'user', content: text, time: formatTime() });
  renderMessages();

  const typing = document.getElementById('chat-typing');
  if (typing) typing.style.display = 'flex';

  const sendBtn = document.getElementById('btn-chat-send');
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.disabled = true;

  try {
    const { text: reply } = await api.ai.chat(
      chatHistory.map(m => ({ role: m.role, content: m.content }))
    );
    chatHistory.push({ role: 'assistant', content: reply, time: formatTime() });
    renderMessages();
  } catch (err) {
    chatHistory.push({ role: 'assistant', content: `Lo siento, ocurrió un error: ${err.message}`, time: formatTime() });
    renderMessages();
    toast('Error al contactar el asistente', 'er');
  } finally {
    if (typing) typing.style.display = 'none';
    if (sendBtn) sendBtn.disabled = false;
    if (input) { input.disabled = false; input.focus(); }
  }
}

export function clearChat() {
  chatHistory = [];
  renderMessages();
}

export function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMsg();
  }
}
