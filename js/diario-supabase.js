/* =============================================================================
   diario-supabase.js — DIÁRIO DO DIA (km e faturamento) NO SUPABASE
   -----------------------------------------------------------------------------
   Um lançamento por dia (tabela "diario", banco/15-administracao-do-negocio.sql).
   Só o gestor da empresa enxerga.

     App.diario.doMes("2026-10")     -> Promise com os dias do mês (mais recente primeiro)
     App.diario.ultimoAntes(data)    -> Promise com o último dia lançado antes de "data" (ou null)
     App.diario.salvar({ data, kmInicial, kmFinal, faturamento, corridas, observacoes })
                                     -> Promise (se o dia já existe, atualiza)
     App.diario.excluir(id)          -> Promise
   ============================================================================= */

App.diario = (function () {
  function sb() { return App.auth.conexao(); }
  function empresaId() {
    var s = App.sessao.atual();
    return s && s.empresa ? s.empresa.id : null;
  }
  function numero(v) { return v === null || v === undefined ? null : Number(v); }

  function doBanco(l) {
    return { id: l.id, data: l.data, kmInicial: numero(l.km_inicial), kmFinal: numero(l.km_final),
             faturamento: Number(l.faturamento) || 0, corridas: l.corridas, observacoes: l.observacoes || "" };
  }

  function doMes(mes) {
    var p = mes.split("-");
    var ano = Number(p[0]), m = Number(p[1]);
    var fim = (m === 12 ? (ano + 1) + "-01" : ano + "-" + String(m + 1).padStart(2, "0")) + "-01";
    return sb().from("diario").select("*").gte("data", mes + "-01").lt("data", fim).order("data", { ascending: false })
      .then(function (r) {
        if (r.error) throw new Error("Não foi possível carregar o diário.");
        return r.data.map(doBanco);
      });
  }

  function ultimoAntes(data) {
    return sb().from("diario").select("*").lt("data", data).order("data", { ascending: false }).limit(1)
      .then(function (r) { return r.data && r.data.length ? doBanco(r.data[0]) : null; });
  }

  function salvar(d) {
    var linha = {
      empresa_id: empresaId(), data: d.data, km_inicial: d.kmInicial, km_final: d.kmFinal,
      faturamento: App.utils.arredondar(Number(d.faturamento) || 0), corridas: d.corridas, observacoes: d.observacoes || null
    };
    return sb().from("diario").upsert(linha, { onConflict: "empresa_id,data" }).select().single().then(function (r) {
      if (r.error) {
        if (r.error.code === "23514") throw new Error("O km final não pode ser menor que o km inicial.");
        throw new Error("Não foi possível salvar o dia.");
      }
      return doBanco(r.data);
    });
  }

  function excluir(id) {
    return sb().from("diario").delete().eq("id", id).then(function (r) {
      if (r.error) throw new Error("Não foi possível excluir o dia.");
    });
  }

  return { doMes: doMes, ultimoAntes: ultimoAntes, salvar: salvar, excluir: excluir };
})();
