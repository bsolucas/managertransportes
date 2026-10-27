/* =============================================================================
   despesas-supabase.js — DESPESAS NO SUPABASE
   -----------------------------------------------------------------------------
   Lê e grava a tabela "despesas" (banco/13-despesas.sql). Só o gestor da empresa
   enxerga. Cada consulta traz um MÊS inteiro (as telas mostram um mês por vez).

     App.despesas.CATEGORIAS                 -> { chave: { rotulo } }
     App.despesas.doMes("2026-10")           -> Promise com a lista do mês (mais recente primeiro)
     App.despesas.salvar({ id?, data, categoria, descricao, valor }) -> Promise
     App.despesas.excluir(id)                -> Promise
   ============================================================================= */

App.despesas = (function () {
  var CATEGORIAS = {
    combustivel:    { rotulo: "Combustível" },
    manutencao:     { rotulo: "Manutenção e peças" },
    pedagio:        { rotulo: "Pedágio" },
    estacionamento: { rotulo: "Estacionamento" },
    lavagem:        { rotulo: "Lavagem" },
    documentos:     { rotulo: "Documentos e seguro" },
    financiamento:  { rotulo: "Parcela do veículo" },
    alimentacao:    { rotulo: "Alimentação" },
    outros:         { rotulo: "Outros" }
  };

  function sb() { return App.auth.conexao(); }
  function empresaId() {
    var s = App.sessao.atual();
    return s && s.empresa ? s.empresa.id : null;
  }

  function doBanco(l) {
    return { id: l.id, data: l.data, categoria: l.categoria, descricao: l.descricao || "", valor: Number(l.valor) || 0 };
  }

  /* "2026-10" -> primeiro dia do mês e primeiro dia do mês seguinte. */
  function limitesDoMes(mes) {
    var p = mes.split("-");
    var ano = Number(p[0]), m = Number(p[1]);
    var proximo = m === 12 ? (ano + 1) + "-01" : ano + "-" + String(m + 1).padStart(2, "0");
    return { ini: mes + "-01", fim: proximo + "-01" };
  }

  function doMes(mes) {
    var l = limitesDoMes(mes);
    return sb().from("despesas").select("*").gte("data", l.ini).lt("data", l.fim)
      .order("data", { ascending: false }).order("criado_em", { ascending: false })
      .then(function (r) {
        if (r.error) throw new Error("Não foi possível carregar as despesas.");
        return r.data.map(doBanco);
      });
  }

  function salvar(d) {
    var linha = { data: d.data, categoria: d.categoria, descricao: d.descricao || null, valor: App.utils.arredondar(Number(d.valor) || 0) };
    var consulta = d.id
      ? sb().from("despesas").update(linha).eq("id", d.id)
      : sb().from("despesas").insert(Object.assign({ empresa_id: empresaId() }, linha));
    return consulta.select().single().then(function (r) {
      if (r.error) throw new Error("Não foi possível salvar a despesa.");
      return doBanco(r.data);
    });
  }

  function excluir(id) {
    return sb().from("despesas").delete().eq("id", id).then(function (r) {
      if (r.error) throw new Error("Não foi possível excluir a despesa.");
    });
  }

  return { CATEGORIAS: CATEGORIAS, doMes: doMes, salvar: salvar, excluir: excluir };
})();
