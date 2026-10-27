/* =============================================================================
   pagamentos-supabase.js — COMO CADA MOTORISTA É PAGO (comissão ou CLT)
   -----------------------------------------------------------------------------
   Veja banco/16-pagamentos-motoristas.sql. Duas formas:
     • comissão: % sobre a corrida concluída (valor + extras). Existe uma comissão
       PADRÃO da empresa ("todos a mesma") e cada motorista pode ter a sua própria;
     • CLT: o gestor guarda o salário. O motorista nunca recebe esse valor.

   Gestor:
     App.pagamentos.carregar()                    -> Promise (traz tudo para a memória)
     App.pagamentos.padrao()                      -> % padrão da empresa
     App.pagamentos.doMotorista(id)               -> { tipo, percentual (null = padrão), salario, efetivo (%) }
     App.pagamentos.definirPadrao(pct, aplicarATodos)
                                                  -> Promise; "aplicarATodos" apaga as % individuais
     App.pagamentos.salvarMotorista(id, { tipo, percentual, salario }) -> Promise
     App.pagamentos.aoMudar(fn)                   -> avisa quando algo é alterado

   Motorista:
     App.pagamentos.meuTipo()                     -> Promise: "comissao" ou "clt"

   Os dois:
     App.pagamentos.PERIODOS                      -> [{ id, rotulo, de(), ate() }] (em ms)
   ============================================================================= */

App.pagamentos = (function () {
  var config = { padrao: 0 };
  var porMot = {};      // motorista_id -> { tipo, percentual, salario }
  var ouvintes = [];

  function sb() { return App.auth.conexao(); }
  function empresaId() {
    var s = App.sessao.atual();
    return s && s.empresa ? s.empresa.id : null;
  }
  function avisar() { ouvintes.forEach(function (fn) { fn(); }); }
  function numeroOuNulo(v) { return v === null || v === undefined || v === "" ? null : Number(v); }

  function carregar() {
    return Promise.all([
      sb().from("pagamento_config").select("comissao_padrao").maybeSingle(),
      sb().from("pagamentos_motoristas").select("motorista_id, tipo, comissao_percentual, salario")
    ]).then(function (r) {
      config.padrao = r[0].data ? Number(r[0].data.comissao_padrao) : 0;
      porMot = {};
      (r[1].data || []).forEach(function (l) {
        porMot[l.motorista_id] = { tipo: l.tipo, percentual: numeroOuNulo(l.comissao_percentual), salario: numeroOuNulo(l.salario) };
      });
      avisar();
    });
  }

  function padrao() { return config.padrao; }

  function doMotorista(id) {
    var p = porMot[id] || { tipo: "comissao", percentual: null, salario: null };
    return { tipo: p.tipo, percentual: p.percentual, salario: p.salario,
             efetivo: p.percentual === null ? config.padrao : p.percentual };
  }

  function erroGeral() { return new Error("Não foi possível salvar. Tente novamente."); }

  function definirPadrao(pct, aplicarATodos) {
    return sb().from("pagamento_config").upsert({ empresa_id: empresaId(), comissao_padrao: pct }, { onConflict: "empresa_id" })
      .then(function (r) {
        if (r.error) throw erroGeral();
        if (!aplicarATodos) return null;
        return sb().from("pagamentos_motoristas").update({ comissao_percentual: null, atualizado_em: new Date().toISOString() })
          .eq("empresa_id", empresaId()).then(function (r2) { if (r2.error) throw erroGeral(); });
      }).then(carregar);
  }

  function salvarMotorista(id, d) {
    var linha = {
      motorista_id: id, empresa_id: empresaId(), tipo: d.tipo,
      comissao_percentual: d.tipo === "comissao" ? numeroOuNulo(d.percentual) : null,
      salario: d.tipo === "clt" ? numeroOuNulo(d.salario) : null,
      atualizado_em: new Date().toISOString()
    };
    return sb().from("pagamentos_motoristas").upsert(linha, { onConflict: "motorista_id" })
      .then(function (r) { if (r.error) throw erroGeral(); return carregar(); });
  }

  function meuTipo() {
    return sb().rpc("meu_tipo_pagamento").then(function (r) { return r.error || !r.data ? "comissao" : r.data; });
  }

  /* Períodos para somar: quinzenas (1–15 e 16–fim do mês) e meses. "ate" é exclusivo. */
  function inicioDaQuinzena(d, voltar) {
    var ano = d.getFullYear(), mes = d.getMonth(), primeira = d.getDate() <= 15;
    if (voltar) { if (primeira) { mes -= 1; primeira = false; } else primeira = true; }
    return primeira ? new Date(ano, mes, 1) : new Date(ano, mes, 16);
  }
  function fimDaQuinzena(ini) { return ini.getDate() === 1 ? new Date(ini.getFullYear(), ini.getMonth(), 16) : new Date(ini.getFullYear(), ini.getMonth() + 1, 1); }
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function rotuloQuinzena(ini) {
    var ult = new Date(fimDaQuinzena(ini).getTime() - 86400000).getDate();
    return (ini.getDate() === 1 ? "1 a 15" : "16 a " + ult) + " de " + MESES[ini.getMonth()];
  }

  var PERIODOS = [
    { id: "quinzena_atual", mensal: false,
      rotulo: function () { return "Esta quinzena (" + rotuloQuinzena(inicioDaQuinzena(new Date(), false)) + ")"; },
      de: function () { return inicioDaQuinzena(new Date(), false).getTime(); },
      ate: function () { return fimDaQuinzena(inicioDaQuinzena(new Date(), false)).getTime(); } },
    { id: "quinzena_anterior", mensal: false,
      rotulo: function () { return "Quinzena anterior (" + rotuloQuinzena(inicioDaQuinzena(new Date(), true)) + ")"; },
      de: function () { return inicioDaQuinzena(new Date(), true).getTime(); },
      ate: function () { return fimDaQuinzena(inicioDaQuinzena(new Date(), true)).getTime(); } },
    { id: "mes_atual", mensal: true,
      rotulo: function () { return "Este mês (" + MESES[new Date().getMonth()] + ")"; },
      de: function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); },
      ate: function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); } },
    { id: "mes_anterior", mensal: true,
      rotulo: function () { var d = new Date(); return "Mês anterior (" + MESES[new Date(d.getFullYear(), d.getMonth() - 1, 1).getMonth()] + ")"; },
      de: function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); },
      ate: function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); } }
  ];

  return { carregar: carregar, padrao: padrao, doMotorista: doMotorista, definirPadrao: definirPadrao,
           salvarMotorista: salvarMotorista, meuTipo: meuTipo, aoMudar: function (fn) { ouvintes.push(fn); }, PERIODOS: PERIODOS };
})();
