/* =============================================================================
   validacao.js — AJUDANTES COMPARTILHADOS (cadastro.html e pagamento.html)
   -----------------------------------------------------------------------------
   Máscaras e validações de telefone, CPF/CNPJ, e-mail e moeda. O banco repete as
   regras de cadastro (banco/05-cadastro-assinantes.sql): aqui é só para avisar
   a pessoa antes de enviar.
     window.Validacao = { soNumeros, escapar, moeda, formatarTelefone, formatarDocumento,
                          documentoValido, celularValido, emailPessoalValido }
   ============================================================================= */
window.Validacao = (function () {

  function soNumeros(t) { return String(t || "").replace(/\D/g, ""); }

  function escapar(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function moeda(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

  function formatarTelefone(t) {
    var d = soNumeros(t).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  /* Formata como CPF (até 11 dígitos) ou CNPJ (até 14) enquanto digita. */
  function formatarDocumento(t) {
    var d = soNumeros(t).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
    }
    return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  /* Dígito verificador de CPF/CNPJ. */
  function digito(base, pesos) {
    var soma = 0;
    for (var i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
    var resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  function documentoValido(texto) {
    var d = soNumeros(texto);
    if (/^(\d)\1+$/.test(d)) return false; // 000.000.000-00 etc.
    if (d.length === 11) {
      var c1 = digito(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
      var c2 = digito(d.slice(0, 9) + c1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
      return d === d.slice(0, 9) + c1 + c2;
    }
    if (d.length === 14) {
      var n1 = digito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      var n2 = digito(d.slice(0, 12) + n1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return d === d.slice(0, 12) + n1 + n2;
    }
    return false;
  }

  /* Celular brasileiro: DDD + 9 + 8 dígitos (11 números). */
  function celularValido(texto) { return /^\d{2}9\d{8}$/.test(soNumeros(texto)); }

  /* E-mails pessoais aceitos no cadastro (o banco confere de novo). */
  var DOMINIOS_PESSOAIS = ["gmail.com", "googlemail.com", "outlook.com", "outlook.com.br",
                           "hotmail.com", "hotmail.com.br", "live.com", "msn.com"];
  function emailPessoalValido(email) {
    var dominio = String(email || "").toLowerCase().split("@")[1];
    return DOMINIOS_PESSOAIS.indexOf(dominio) !== -1;
  }

  return { soNumeros: soNumeros, escapar: escapar, moeda: moeda, formatarTelefone: formatarTelefone,
           formatarDocumento: formatarDocumento, documentoValido: documentoValido,
           celularValido: celularValido, emailPessoalValido: emailPessoalValido };
})();
