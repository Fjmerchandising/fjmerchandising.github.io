/* ===========================================================
   FJ MERCHANDISING — script.js
   Filtro de público, validação, máscara, captura via Google
   Sheets (Apps Script) e redirect para WhatsApp do Fábio
   =========================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------
  // 0. CONFIG — CONFERIR/AJUSTAR ANTES DE PUBLICAR
  // ---------------------------------------------------------

  // Número do fundador (Fábio) — destino do redirect do WhatsApp
  const WA_NUMBER = '554991939450';

  // Endpoint do Google Apps Script — grava cada lead numa planilha Google
  // E manda um e-mail de aviso para o Fábio. 100% grátis, sem limite.
  // Passo a passo para ativar: ver instruções no final deste arquivo.
  // Cole aqui a URL que o Apps Script gerar (algo como:
  //   https://script.google.com/macros/s/AKfycb..../exec ).
  // Se ficar vazio, o lead vai SÓ pelo WhatsApp (sem registro na planilha).
  const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbx7Cybpz-4IsOwN7aCLKn3F_OdVkhMHm-W6mD3kvZKVeGw9ntytSgzLa0km_Drw3njXDg/exec';

  // ---------------------------------------------------------
  // 1. Referências do DOM
  // ---------------------------------------------------------
  const form          = document.getElementById('leadForm');
  const radios        = form.querySelectorAll('input[name="userType"]');
  const industriaBlock= document.getElementById('industriaFields');
  const candidatoBlock= document.getElementById('candidatoMsg');
  const whatsappInput = document.getElementById('whatsapp');
  const desafioInput  = document.getElementById('desafio');
  const charCount     = document.getElementById('charCount');

  // ---------------------------------------------------------
  // 2. Filtro: indústria x candidato
  // ---------------------------------------------------------
  radios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const value = e.target.value;

      if (value === 'industria') {
        industriaBlock.hidden = false;
        candidatoBlock.hidden = true;
        // marca campos obrigatórios
        toggleRequired(true);
      } else if (value === 'candidato') {
        industriaBlock.hidden = true;
        candidatoBlock.hidden = false;
        toggleRequired(false);
      }
    });
  });

  function toggleRequired(required) {
    ['nome', 'empresa', 'cargo', 'whatsapp', 'cidade'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (required) el.setAttribute('required', 'required');
      else el.removeAttribute('required');
    });
  }

  // ---------------------------------------------------------
  // 3. Máscara de telefone brasileiro
  //    Formatos: (47) 9999-9999  ou  (47) 99999-9999
  // ---------------------------------------------------------
  if (whatsappInput) {
    whatsappInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 11);

      if (v.length === 0) {
        e.target.value = '';
        return;
      }

      let out = '(' + v.slice(0, 2);
      if (v.length >= 2) out += ') ';

      if (v.length <= 6) {
        out += v.slice(2);
      } else if (v.length <= 10) {
        out += v.slice(2, 6) + '-' + v.slice(6);
      } else {
        out += v.slice(2, 7) + '-' + v.slice(7);
      }

      e.target.value = out;
    });
  }

  // ---------------------------------------------------------
  // 4. Contador do textarea
  // ---------------------------------------------------------
  if (desafioInput && charCount) {
    desafioInput.addEventListener('input', () => {
      charCount.textContent = desafioInput.value.length;
    });
  }

  // ---------------------------------------------------------
  // 5. Submissão do formulário
  // ---------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userType = form.querySelector('input[name="userType"]:checked');
    if (!userType) {
      alert('Por favor, selecione a sua situação para continuar.');
      return;
    }

    // Caminho candidato: não tem submit, mas reforço
    if (userType.value === 'candidato') return;

    // Validação dos campos da indústria
    const data = {
      nome:    getVal('nome'),
      empresa: getVal('empresa'),
      cargo:   getVal('cargo'),
      whatsapp:getVal('whatsapp'),
      cidade:  getVal('cidade'),
      desafio: getVal('desafio')
    };

    if (!validate(data)) return;

    // Estado de "enviando" no botão
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'ENVIANDO...';

    // Evento de conversão — GA4
    if (typeof gtag === 'function') {
      gtag('event', 'generate_lead', {
        source: 'hero-form',
        empresa: data.empresa,
        cidade:  data.cidade,
        cargo:   data.cargo
      });
    }

    // Captura na planilha Google (registro + e-mail) antes do redirect
    await sendToSheet(data);

    // Monta URL do WhatsApp e redireciona
    const msg = buildWhatsappMessage(data);
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

    submitBtn.textContent = originalLabel;
    submitBtn.disabled = false;

    window.location.href = url;
  });

  // Envio para a planilha Google via Apps Script (fire-and-forget c/ timeout).
  // Usa Content-Type 'text/plain' para evitar CORS preflight com Apps Script.
  // Não bloqueia o redirect para WhatsApp se a planilha estiver offline.
  async function sendToSheet(data) {
    if (!SHEETS_ENDPOINT) return; // não configurado: pula
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000); // 4s máx

      const payload = {
        timestamp: new Date().toISOString(),
        nome:     data.nome,
        empresa:  data.empresa,
        cargo:    data.cargo,
        whatsapp: data.whatsapp,
        cidade:   data.cidade,
        desafio:  data.desafio || '',
        origem:   'Landing Page FJ Merchandising'
      };

      await fetch(SHEETS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        // 'no-cors' permite o POST sem preflight; resposta vira opaca,
        // mas o Apps Script recebe o body normal.
        mode: 'no-cors'
      });

      clearTimeout(timeout);
    } catch (err) {
      console.warn('Falha ao gravar na planilha, seguindo p/ WhatsApp:', err);
    }
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function validate(data) {
    const required = ['nome', 'empresa', 'cargo', 'whatsapp', 'cidade'];
    let firstInvalid = null;

    required.forEach((key) => {
      const el = document.getElementById(key);
      if (!data[key]) {
        el.classList.add('invalid');
        if (!firstInvalid) firstInvalid = el;
      } else {
        el.classList.remove('invalid');
      }
    });

    // Telefone precisa de pelo menos 10 dígitos
    const digits = data.whatsapp.replace(/\D/g, '');
    if (digits.length < 10) {
      const el = document.getElementById('whatsapp');
      el.classList.add('invalid');
      if (!firstInvalid) firstInvalid = el;
    }

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    return true;
  }

  function buildWhatsappMessage(d) {
    const desafio = d.desafio ? d.desafio : 'a definir na conversa';
    return (
      `Olá! Acabei de preencher o formulário no site da FJ Merchandising. ` +
      `Sou ${d.nome}, da ${d.empresa}, cargo ${d.cargo}, em ${d.cidade}. ` +
      `Nosso principal desafio é: ${desafio}. ` +
      `Gostaria de agendar o diagnóstico estratégico.`
    );
  }

  // Limpa estado "invalid" enquanto o usuário digita
  form.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => el.classList.remove('invalid'));
  });

  // ---------------------------------------------------------
  // 6. Smooth scroll para CTAs com âncora
  //    (complementa o html { scroll-behavior } pra cobrir Safari)
  // ---------------------------------------------------------
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Foco no primeiro campo do formulário quando o usuário aciona o CTA final
      if (id === '#hero-form') {
        const firstRadio = form.querySelector('input[name="userType"]');
        if (firstRadio) setTimeout(() => firstRadio.focus({ preventScroll: true }), 600);
      }
    });
  });

  // ---------------------------------------------------------
  // 7. Fade-in das seções ao scroll (IntersectionObserver)
  // ---------------------------------------------------------
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // ---------------------------------------------------------
  // 8. Tracking de cliques no WhatsApp (rodapé + botão flutuante)
  //    Dispara evento no GA4 toda vez que alguém clica em link wa.me
  // ---------------------------------------------------------
  document.querySelectorAll('.wa-link').forEach((link) => {
    link.addEventListener('click', () => {
      const source = link.getAttribute('data-wa-source') || 'unknown';
      if (typeof gtag === 'function') {
        gtag('event', 'click_whatsapp', {
          source: source,
          location: window.location.pathname
        });
      }
      // Loga também no console p/ debug
      console.log('whatsapp_click', { source });
    });
  });

})();
