/* =============================================================================
   landing.js — COMPORTAMENTO DA LANDING PAGE
   Preenche marca, preços dos planos e link do sistema, abre o menu no celular
   e marca o ano do rodapé. Os dados vêm de js/config.js.
   ============================================================================= */
(function () {
  var cfg = window.CONFIG || {};

  /* Nome da marca em todos os lugares */
  document.querySelectorAll("[data-marca]").forEach(function (el) { el.textContent = cfg.marca; });
  document.title = cfg.marca + " — gestão de corridas e motoristas";

  /* Preços dos planos: vêm de js/config.js (o HTML já traz o mesmo valor como reserva). */
  (cfg.planos || []).forEach(function (plano) {
    var el = document.querySelector('[data-preco="' + plano.id + '"]');
    if (!el) return;
    var partes = plano.preco.toFixed(2).split(".");
    el.innerHTML = "<span>R$</span> " + partes[0] + "<small>," + partes[1] + "/mês</small>";
  });

  /* Botão "Ver o sistema": só aparece se o link estiver preenchido */
  document.querySelectorAll("[data-sistema]").forEach(function (a) {
    if (cfg.sistema) { a.href = cfg.sistema; a.target = "_blank"; a.rel = "noopener"; }
    else a.hidden = true;
  });

  /* Menu do celular */
  var menu = document.getElementById("menu");
  var botao = document.getElementById("menu-botao");
  botao.addEventListener("click", function () {
    var aberto = menu.classList.toggle("aberto");
    botao.setAttribute("aria-expanded", aberto ? "true" : "false");
  });
  menu.addEventListener("click", function (ev) {
    if (ev.target.tagName === "A") { menu.classList.remove("aberto"); botao.setAttribute("aria-expanded", "false"); }
  });

  /* Ano do rodapé */
  document.getElementById("ano").textContent = new Date().getFullYear();
})();
