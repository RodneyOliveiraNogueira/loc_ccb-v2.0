const SHEET_ID = "1QDUCLr8tZzTbxc1dwSf0Pl-0U7MjGyu7IzCgq95za1o";
const NOME_ABA = "Cadastro";
const NOME_ABA_AREAS = "Áreas_Comuns";
const URL_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwwYNic6HrlhNeps58h2MERfJZ-DOcfXm2wbfPWRoAP1wKvWsrYVCbqf_kcuduSjzNw/exec";

let COORD_PORTARIA = { lat: -22.816945097334372, lng: -42.088560977464915 };

let baseEnderecos = [];
let baseAreasComuns = [];
let historicoAcessosCache = [];
let historicoPorCpf = {};
let filaEntregas = [];
let mapaLeaflet = null;
let camadaMarcadores = null;

let documentoAtual = "";
let modoOutrosAtivo = false;
let modoViagemSelecionado = "";
let perfilSelecionado = "";
let cnhSelecionada = "";
let deslocamentoConfirmado = false;

window.onload = async () => {
  configurarVisibilidadeDispositivo();
  if (window.innerWidth >= 900) {
    await carregarUltimosAcessos();
  }
  await carregarPlanilha();
  configurarBotaoPortaria();
  inicializarMapaPC();
  carregarFilaLocal();
  carregarDadosSalvosCelular();
  atualizarEstadoBotoesAcao();

  const inputDoc = document.getElementById("documento-cpf");
  if (inputDoc && window.innerWidth >= 900) inputDoc.focus();

  if (window.innerWidth >= 900) {
    setInterval(carregarUltimosAcessos, 20000);
  }
};

// Adiciona detecção de Enter no campo de CPF para disparar o OK, Continuar
document.addEventListener("DOMContentLoaded", () => {
  const inputCpf = document.getElementById("documento-cpf");
  if (inputCpf) {
    inputCpf.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (documentoAtual.length === 11) {
          confirmarDeslocamento();
        }
      }
    });
  }
});

function ehDispositivoMovel() {
  return (
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
    window.innerWidth < 900
  );
}

function configurarVisibilidadeDispositivo() {
  const ehCelular = ehDispositivoMovel();
  const btnPortaria = document.getElementById("btn-rota-portaria");
  const btnContatoFora = document.querySelector(".btn-contato-portaria-fora");
  const painelUltimos = document.getElementById("painel-ultimos-acessos");

  if (btnPortaria) btnPortaria.style.display = ehCelular ? "flex" : "none";
  if (btnContatoFora)
    btnContatoFora.style.display = ehCelular ? "flex" : "none";
  if (painelUltimos) painelUltimos.style.display = ehCelular ? "none" : "flex";
}

function converterTransporteParaModo(strTransporte) {
  const t = (strTransporte || "").toLowerCase();
  if (t.includes("moto")) return "two-wheeler";
  if (t.includes("pé") || t.includes("pe")) return "walking";
  return "driving";
}

function aoDigitarDocumento() {
  esconderErro();
  const input = document.getElementById("documento-cpf");
  const btnOutros = document.getElementById("btn-doc-outros");
  const blocoPos = document.getElementById("bloco-pos-documento");

  input.value = input.value.replace(/\D/g, "");
  const val = input.value;

  if (val.length > 0) {
    modoOutrosAtivo = false;
    if (btnOutros) btnOutros.classList.remove("ativo");
    input.classList.add("preenchido");
  } else {
    input.classList.remove("preenchido");
  }

  if (val.length === 11) {
    documentoAtual = val;
    blocoPos.style.display = "flex";

    const regCpf = historicoPorCpf[val];
    if (regCpf) {
      const inputNome = document.getElementById("nome-visitante");
      inputNome.value = regCpf.nome || "";
      inputNome.classList.add("preenchido");

      if (regCpf.perfil) selecionarPerfil(regCpf.perfil);

      if (regCpf.ultimoDestinoStr) {
        document.getElementById("txt-ultimo-destino").textContent =
          regCpf.ultimoDestinoStr;
        document.getElementById("box-atalho-destino").style.display = "block";
      } else {
        document.getElementById("box-atalho-destino").style.display = "none";
      }

      const modoRecente = regCpf.ultimoModo || "driving";
      selecionarModo(modoRecente, true);
    } else {
      selecionarCNH("Sim");
      document.getElementById("box-atalho-destino").style.display = "none";
    }
  } else {
    documentoAtual = "";
    document.getElementById("box-atalho-destino").style.display = "none";
    if (!modoOutrosAtivo) {
      blocoPos.style.display = "none";
    }
  }
}

function acionarModoOutros() {
  esconderErro();
  const input = document.getElementById("documento-cpf");
  const btnOutros = document.getElementById("btn-doc-outros");
  const blocoPos = document.getElementById("bloco-pos-documento");

  input.value = "";
  input.classList.remove("preenchido");
  documentoAtual = "Outros";
  modoOutrosAtivo = true;

  if (btnOutros) btnOutros.classList.add("ativo");
  blocoPos.style.display = "flex";
  document.getElementById("box-atalho-destino").style.display = "none";

  cnhSelecionada = "";
  document
    .querySelectorAll("#box-cnh-pc .btn-chip-acesso")
    .forEach((b) => b.classList.remove("ativo"));
}

function selecionarModo(modo, vindoDeBuscaCpf = false) {
  esconderErro();
  modoViagemSelecionado = modo;

  document
    .querySelectorAll(".btn-modo")
    .forEach((btn) => btn.classList.remove("ativo"));
  const btnAtivo = document.getElementById(`modo-${modo}`);
  if (btnAtivo) btnAtivo.classList.add("ativo");

  const dadosExtra = document.getElementById("dados-acesso-extra");
  const boxPlaca = document.getElementById("box-placa");
  const inputPlaca = document.getElementById("placa");
  const boxCnhPc = document.getElementById("box-cnh-pc");
  const labelDoc = document.getElementById("label-documento");

  dadosExtra.style.display = "flex";

  if (window.innerWidth >= 900 && boxCnhPc) {
    boxCnhPc.style.display = "flex";
  }

  const temCpfDigitado = documentoAtual.length === 11 && !modoOutrosAtivo;
  const regCpf = temCpfDigitado ? historicoPorCpf[documentoAtual] : null;

  if (modo === "driving" || modo === "two-wheeler") {
    boxPlaca.style.display = "flex";
    if (labelDoc) labelDoc.textContent = "PORTA CNH?";

    if (temCpfDigitado) {
      selecionarCNH("Sim");
      if (regCpf && regCpf.placasPorModo && regCpf.placasPorModo[modo]) {
        inputPlaca.value = regCpf.placasPorModo[modo];
        inputPlaca.classList.add("preenchido");
      } else {
        inputPlaca.value = "";
        inputPlaca.classList.remove("preenchido");
        if (window.innerWidth >= 900) setTimeout(() => inputPlaca.focus(), 50);
      }
    } else if (window.innerWidth < 900) {
      carregarDadosSalvosCelular();
    } else {
      if (!vindoDeBuscaCpf) setTimeout(() => inputPlaca.focus(), 50);
    }
  } else {
    boxPlaca.style.display = "none";
    if (inputPlaca) {
      inputPlaca.value = "";
      inputPlaca.classList.remove("preenchido");
    }
    if (labelDoc) labelDoc.textContent = "PORTA ID?";

    if (temCpfDigitado) {
      selecionarCNH("Sim");
    } else if (window.innerWidth >= 900) {
      setTimeout(() => document.getElementById("nome-visitante").focus(), 50);
    }
  }

  configurarBotaoPortaria();
}

function selecionarPerfil(perfil) {
  esconderErro();
  perfilSelecionado = perfil;
  document
    .querySelectorAll("#dados-acesso-extra .btn-chip-acesso[id^='perfil-']")
    .forEach((b) => b.classList.remove("ativo"));
  const btn = document.getElementById(`perfil-${perfil}`);
  if (btn) btn.classList.add("ativo");
}

function selecionarCNH(op) {
  esconderErro();
  cnhSelecionada = op;
  document
    .querySelectorAll("#box-cnh-pc .btn-chip-acesso")
    .forEach((b) => b.classList.remove("ativo"));
  const btn = document.getElementById(`cnh-${op}`);
  if (btn) btn.classList.add("ativo");
}

function formatarPlaca() {
  esconderErro();
  const input = document.getElementById("placa");
  const placaDigitada = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  input.value = placaDigitada;

  if (placaDigitada.length > 0) {
    input.classList.add("preenchido");
  } else {
    input.classList.remove("preenchido");
  }

  if (
    placaDigitada.length >= 7 &&
    historicoAcessosCache.length > 0 &&
    modoOutrosAtivo
  ) {
    const placaLimpaBusca = placaDigitada.replace(/[^A-Z0-9]/g, "");
    const registroRecorrente = historicoAcessosCache.find(
      (item) => item.placa.replace(/[^A-Z0-9]/g, "") === placaLimpaBusca,
    );

    if (registroRecorrente) {
      const inputNome = document.getElementById("nome-visitante");
      inputNome.value = registroRecorrente.nome;
      inputNome.classList.add("preenchido");
      if (registroRecorrente.perfil) {
        selecionarPerfil(registroRecorrente.perfil);
      }
      if (window.innerWidth >= 900 && registroRecorrente.cnh) {
        const cnhNormalizada = registroRecorrente.cnh
          .toLowerCase()
          .includes("sim")
          ? "Sim"
          : "Não";
        selecionarCNH(cnhNormalizada);
      }
    }
  }
}

function usarUltimoDestinoDireto() {
  const temCpf = documentoAtual.length === 11 && !modoOutrosAtivo;
  if (!temCpf) return;
  const regCpf = historicoPorCpf[documentoAtual];
  if (!regCpf || !regCpf.ultimoDestinoStr) return;

  if (!validarDeslocamento()) return;

  let destObj = regCpf.ultimoDestinoObj;
  if (!destObj) {
    destObj = parseDestinoObj(regCpf.ultimoDestinoStr);
  }

  if (!destObj) {
    mostrarErro("Não foi possível localizar as coordenadas do último destino.");
    return;
  }

  // Deixa o card superior recolhido com o resumo e esconde o botão opcional para focar no QR Code
  const cardDeslocamento = document.getElementById("card-deslocamento");
  const corpoDeslocamento = document.getElementById("corpo-deslocamento");
  const resumo = document.getElementById("resumo-deslocamento");
  const boxAtalho = document.getElementById("box-atalho-destino");

  if (cardDeslocamento) cardDeslocamento.classList.add("recolhido");
  if (corpoDeslocamento) corpoDeslocamento.style.display = "none";
  if (boxAtalho) boxAtalho.style.display = "none";

  const nomesModo = {
    driving: "Carro",
    "two-wheeler": "Moto",
    walking: "A pé",
  };
  const nomeModo = nomesModo[modoViagemSelecionado] || modoViagemSelecionado;
  const placaTxt =
    modoViagemSelecionado === "walking"
      ? ""
      : ` (${document.getElementById("placa").value.toUpperCase()})`;
  const nomeVisitante = document
    .getElementById("nome-visitante")
    .value.trim()
    .toUpperCase()
    .split(" ")[0];

  if (resumo) {
    resumo.textContent = `${nomeModo}${placaTxt} • ${nomeVisitante}`;
    resumo.style.display = "inline-block";
  }

  processarRotas([destObj]);
}

function carregarDadosSalvosCelular() {
  if (window.innerWidth >= 900) return;

  const inputDoc = document.getElementById("documento-cpf");
  const inputPlaca = document.getElementById("placa");
  const inputNome = document.getElementById("nome-visitante");

  const docSalvo = localStorage.getItem("loc_ccb_doc") || "";
  const ultimaPlaca = localStorage.getItem("loc_ccb_ultima_placa");
  const ultimoNome = localStorage.getItem("loc_ccb_nome");
  const ultimoPerfil = localStorage.getItem("loc_ccb_perfil");

  if (docSalvo.length === 11 && inputDoc && !inputDoc.value) {
    inputDoc.value = docSalvo;
    documentoAtual = docSalvo;
    inputDoc.classList.add("preenchido");
    document.getElementById("bloco-pos-documento").style.display = "flex";
  } else if (docSalvo === "Outros" && !documentoAtual) {
    acionarModoOutros();
  }

  if (ultimaPlaca && inputPlaca && !inputPlaca.value) {
    inputPlaca.value = ultimaPlaca;
    inputPlaca.classList.add("preenchido");
  }
  if (ultimoNome && inputNome && !inputNome.value) {
    inputNome.value = ultimoNome;
    inputNome.classList.add("preenchido");
  }
  if (ultimoPerfil && !perfilSelecionado) selecionarPerfil(ultimoPerfil);
}

function validarDeslocamento() {
  if (!modoOutrosAtivo && documentoAtual.length !== 11) {
    mostrarErro("Digite os 11 números do CPF ou clique em 'Outros'.");
    document.getElementById("documento-cpf").focus();
    return false;
  }

  if (!modoViagemSelecionado) {
    mostrarErro("Selecione o Tipo de Deslocamento (Carro, Moto ou A pé).");
    return false;
  }

  if (
    modoViagemSelecionado === "driving" ||
    modoViagemSelecionado === "two-wheeler"
  ) {
    const inputPlaca = document.getElementById("placa");
    const placaLimpa = inputPlaca.value.replace(/[^A-Z0-9]/g, "");
    const regexPlacaValida = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

    if (!regexPlacaValida.test(placaLimpa)) {
      mostrarErro("Informe uma placa válida (Ex: ABC1234 ou ABC1D23).");
      inputPlaca.focus();
      return false;
    }
  }

  const inputNome = document.getElementById("nome-visitante");
  const nomeLimpo = inputNome ? inputNome.value.trim().toUpperCase() : "";
  if (nomeLimpo.length < 2) {
    mostrarErro("Informe o seu Nome para identificação na portaria.");
    if (inputNome) inputNome.focus();
    return false;
  }

  if (!perfilSelecionado) {
    mostrarErro("Selecione o Perfil de Acesso.");
    return false;
  }

  if (window.innerWidth >= 900 && !cnhSelecionada) {
    const docNome = modoViagemSelecionado === "walking" ? "ID" : "CNH";
    mostrarErro(`Informe se o visitante porta ${docNome} (Sim ou Não).`);
    return false;
  }

  return true;
}

function confirmarDeslocamento() {
  esconderErro();
  if (!validarDeslocamento()) return;

  deslocamentoConfirmado = true;

  const nomesModo = {
    driving: "Carro",
    "two-wheeler": "Moto",
    walking: "A pé",
  };
  const nomeModo = nomesModo[modoViagemSelecionado] || modoViagemSelecionado;
  const placaTxt =
    modoViagemSelecionado === "walking"
      ? ""
      : ` (${document.getElementById("placa").value.toUpperCase()})`;
  const nomeVisitante = document
    .getElementById("nome-visitante")
    .value.trim()
    .toUpperCase()
    .split(" ")[0];

  const cardDeslocamento = document.getElementById("card-deslocamento");
  const corpoDeslocamento = document.getElementById("corpo-deslocamento");
  const tagObrigatorio = document.getElementById("tag-obrigatorio");
  const resumo = document.getElementById("resumo-deslocamento");

  cardDeslocamento.classList.add("recolhido");
  corpoDeslocamento.style.display = "none";
  if (tagObrigatorio) tagObrigatorio.style.display = "none";

  resumo.textContent = `${nomeModo}${placaTxt} • ${nomeVisitante}`;
  resumo.style.display = "inline-block";

  const sessaoBusca = document.getElementById("sessao-busca");
  sessaoBusca.style.display = "flex";
  document.getElementById("chips-areas-comuns").style.display = "none";
  document.getElementById("container-busca-lotes").style.display = "flex";
  atualizarEstadoBotoesAcao();

  if (window.innerWidth >= 900) {
    setTimeout(() => document.getElementById("lote").focus(), 50);
  }
}

function reabrirDeslocamento() {
  if (!deslocamentoConfirmado) return;
  deslocamentoConfirmado = false;

  const cardDeslocamento = document.getElementById("card-deslocamento");
  const corpoDeslocamento = document.getElementById("corpo-deslocamento");
  const resumo = document.getElementById("resumo-deslocamento");

  cardDeslocamento.classList.remove("recolhido");
  corpoDeslocamento.style.display = "flex";
  resumo.style.display = "none";
}

function obterValorCelula(celula) {
  if (!celula) return "";
  if (
    celula.f !== null &&
    celula.f !== undefined &&
    String(celula.f).trim() !== ""
  ) {
    return String(celula.f).trim();
  }
  if (celula.v !== null && celula.v !== undefined) {
    return String(celula.v).trim();
  }
  return "";
}

async function carregarPlanilha() {
  const urlCadastro = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA)}`;
  const urlAreas = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA_AREAS)}`;

  try {
    const [respCad, respAreas] = await Promise.all([
      fetch(urlCadastro),
      fetch(urlAreas),
    ]);
    const [txtCad, txtAreas] = await Promise.all([
      respCad.text(),
      respAreas.text(),
    ]);

    const dadosCad = JSON.parse(
      txtCad.substring(txtCad.indexOf("{"), txtCad.lastIndexOf("}") + 1),
    );
    const dadosAreas = JSON.parse(
      txtAreas.substring(txtAreas.indexOf("{"), txtAreas.lastIndexOf("}") + 1),
    );

    baseEnderecos = dadosCad.table.rows
      .map((linha) => {
        if (!linha.c) return null;
        const lote = obterValorCelula(linha.c[0]);
        const unidade = obterValorCelula(linha.c[1]);
        const rua = obterValorCelula(linha.c[2]);
        const lado = obterValorCelula(linha.c[3]);
        const coordenada = obterValorCelula(linha.c[4]);

        return {
          lote,
          unidade,
          nomeArea: "",
          rua: !isNaN(Number(rua)) ? Number(rua) : 0,
          lado: lado || "A",
          coordenada,
          ehAreaComum: false,
        };
      })
      .filter(
        (item) =>
          item !== null &&
          item.lote !== "" &&
          item.lote.toUpperCase() !== "LOTE" &&
          item.coordenada !== "",
      );

    baseAreasComuns = dadosAreas.table.rows
      .map((linha) => {
        if (!linha.c || linha.c.length < 4) return null;

        const tipoArea = obterValorCelula(linha.c[0]);
        const nomeArea = obterValorCelula(linha.c[1]);
        const ladoArea = obterValorCelula(linha.c[2]);
        const coordenadaArea = obterValorCelula(linha.c[3]);

        if (!nomeArea || nomeArea.toUpperCase() === "NOME") return null;

        return {
          lote: "0",
          unidade: nomeArea,
          nomeArea: nomeArea,
          rua: 0,
          lado: ladoArea || "A",
          coordenada: coordenadaArea,
          ehAreaComum: true,
        };
      })
      .filter(
        (item) =>
          item !== null && item.nomeArea !== "" && item.coordenada !== "",
      );

    const itemPortaria = baseAreasComuns.find((item) =>
      item.nomeArea.toLowerCase().includes("portaria"),
    );
    if (itemPortaria) {
      const coordP = extrairLatLng(itemPortaria.coordenada);
      if (coordP) COORD_PORTARIA = coordP;
    }

    renderizarBotoesAreasComuns();
  } catch (erro) {
    mostrarErro("Erro ao conectar com a planilha. Verifique a conexão.");
  }
}

function configurarBotaoPortaria() {
  const btnPortaria = document.getElementById("btn-rota-portaria");
  if (btnPortaria) {
    const modo = modoViagemSelecionado || "driving";
    const dest = `${COORD_PORTARIA.lat},${COORD_PORTARIA.lng}`;
    btnPortaria.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${modo}`;
  }
}

function alternarAreasComuns() {
  const boxAreas = document.getElementById("chips-areas-comuns");
  const containerLotes = document.getElementById("container-busca-lotes");
  const btnToggle = document.getElementById("btn-toggle-areas");

  const vaiAbrir = boxAreas.style.display === "none";

  if (vaiAbrir) {
    boxAreas.style.display = "grid";
    containerLotes.style.display = "none";
    btnToggle.textContent = "Áreas Comuns e Lazer (Clique para fechar)";
  } else {
    boxAreas.style.display = "none";
    containerLotes.style.display = "flex";
    btnToggle.textContent = "Áreas Comuns e Lazer (Clique para abrir)";
  }
}

function renderizarBotoesAreasComuns() {
  const container = document.getElementById("chips-areas-comuns");
  container.innerHTML = "";

  const areasUnicas = [];
  const coordsUsadas = new Set();

  baseAreasComuns.forEach((area) => {
    const coordStr = area.coordenada.replace(/\s+/g, "");
    if (!coordsUsadas.has(coordStr)) {
      coordsUsadas.add(coordStr);
      areasUnicas.push(area);
    }
  });

  areasUnicas.forEach((area) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn area-comum";
    btn.textContent = area.nomeArea;
    btn.onclick = () => selecionarAreaComum(area);
    container.appendChild(btn);
  });
}

function selecionarAreaComum(areaObj) {
  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  limparVisorRua();
  document.getElementById("sugestoes-unidades").style.display = "none";
  document.getElementById("chips-areas-comuns").style.display = "none";
  document.getElementById("container-busca-lotes").style.display = "flex";
  document.getElementById("btn-toggle-areas").textContent =
    "Áreas Comuns e Lazer (Clique para abrir)";

  if (!validarDeslocamento()) return;

  processarRotas([areaObj]);
}

function atualizarEstadoBotoesAcao() {
  const loteVal = document.getElementById("lote").value.trim();
  const btnAdd = document.getElementById("btn-add-fila");
  const btnLocalizar = document.getElementById("btn-localizar");
  const temFila = filaEntregas.length > 0;

  if (btnAdd) {
    if (loteVal.length > 0) {
      btnAdd.classList.remove("desativado");
      btnAdd.disabled = false;
    } else {
      btnAdd.classList.add("desativado");
      btnAdd.disabled = true;
    }
  }

  if (btnLocalizar) {
    if (loteVal.length > 0 || temFila) {
      btnLocalizar.classList.remove("desativado");
      btnLocalizar.disabled = false;
    } else {
      btnLocalizar.classList.add("desativado");
      btnLocalizar.disabled = true;
    }
  }
}

function aoDigitarLote() {
  esconderErro();
  const inputLote = document.getElementById("lote");
  inputLote.value = inputLote.value.replace(/\D/g, "");
  const loteDigitado = inputLote.value.trim();

  atualizarEstadoBotoesAcao();

  const boxSugestoes = document.getElementById("sugestoes-unidades");
  const containerChips = document.getElementById("lista-chips-unidades");

  if (!loteDigitado || loteDigitado === "0") {
    boxSugestoes.style.display = "none";
    limparVisorRua();
    return;
  }

  const registrosDoLote = baseEnderecos.filter(
    (item) => String(Number(item.lote)) === String(Number(loteDigitado)),
  );

  if (registrosDoLote.length === 0) {
    boxSugestoes.style.display = "none";
    mostrarVisorInvalido("Não cad.");
    return;
  }

  const registroBase =
    registrosDoLote.find((r) => r.unidade === "-" || r.unidade === "") ||
    registrosDoLote[0];
  atualizarVisorRua(registroBase);

  const unidadesEspecificas = registrosDoLote.filter(
    (r) => r.unidade !== "-" && r.unidade !== "",
  );

  containerChips.innerHTML = "";
  if (unidadesEspecificas.length > 0) {
    unidadesEspecificas.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip-btn";
      chip.textContent = `Unid. ${item.unidade}`;
      chip.onclick = () => {
        document.getElementById("unidade").value = item.unidade;
        validarEmTempoReal();
      };
      containerChips.appendChild(chip);
    });
    boxSugestoes.style.display = "block";
  } else {
    boxSugestoes.style.display = "none";
  }
  validarEmTempoReal();
}

function atualizarVisorRua(item) {
  const statusRua = document.getElementById("status-rua");
  document.getElementById("txt-rua").textContent =
    item.rua > 0 ? `Rua ${item.rua}` : `Lote ${item.lote}`;
  document.getElementById("txt-lado").textContent = item.lado.startsWith("Lado")
    ? item.lado
    : `Lado ${item.lado}`;
  statusRua.className = "rua-display valido";
}

function mostrarVisorInvalido(texto) {
  const statusRua = document.getElementById("status-rua");
  document.getElementById("txt-rua").textContent = texto;
  document.getElementById("txt-lado").textContent = "";
  statusRua.className = "rua-display invalido";
}

function limparVisorRua() {
  const statusRua = document.getElementById("status-rua");
  document.getElementById("txt-rua").textContent = "--";
  document.getElementById("txt-lado").textContent = "";
  statusRua.className = "rua-display";
}

function validarEmTempoReal() {
  esconderErro();
  const lote = document.getElementById("lote").value.trim();
  const unidade = document.getElementById("unidade").value.trim();

  if (!lote || lote === "0") {
    limparVisorRua();
    return null;
  }

  const lotesEncontrados = baseEnderecos.filter(
    (item) => String(Number(item.lote)) === String(Number(lote)),
  );

  if (lotesEncontrados.length === 0) {
    mostrarVisorInvalido("Não cad.");
    return null;
  }

  if (!unidade || unidade === "-") {
    const linhaMestraLote =
      lotesEncontrados.find(
        (item) => item.unidade === "-" || item.unidade === "",
      ) || lotesEncontrados[0];
    atualizarVisorRua(linhaMestraLote);
    return { ...linhaMestraLote, unidade: "Portão do Lote" };
  }

  const unidExata = lotesEncontrados.find(
    (item) =>
      item.unidade !== "-" &&
      (item.unidade.toLowerCase() === unidade.toLowerCase() ||
        String(Number(item.unidade)) === String(Number(unidade))),
  );

  if (unidExata) {
    atualizarVisorRua(unidExata);
    return unidExata;
  } else {
    mostrarVisorInvalido("Unid. não cad.");
    return null;
  }
}

function formatarDestinoMaps(coordenadaBruta) {
  if (!coordenadaBruta) return "";
  return coordenadaBruta.trim().replace(/\s+/g, "");
}

function extrairLatLng(coordenadaBruta) {
  if (!coordenadaBruta) return null;
  const partes = coordenadaBruta.trim().split(",");
  if (
    partes.length === 2 &&
    !isNaN(parseFloat(partes[0])) &&
    !isNaN(parseFloat(partes[1]))
  ) {
    return { lat: parseFloat(partes[0]), lng: parseFloat(partes[1]) };
  }
  return null;
}

function inicializarMapaPC() {
  const divMapa = document.getElementById("mapa-interativo");
  if (!divMapa) return;
  mapaLeaflet = L.map("mapa-interativo").setView(
    [COORD_PORTARIA.lat, COORD_PORTARIA.lng],
    17,
  );
  L.tileLayer("https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
  }).addTo(mapaLeaflet);
  camadaMarcadores = L.layerGroup().addTo(mapaLeaflet);
  desenharPortariaNoMapa();
  setTimeout(() => mapaLeaflet.invalidateSize(), 200);
}

function desenharPortariaNoMapa() {
  if (!camadaMarcadores) return;
  camadaMarcadores.clearLayers();
  L.circleMarker([COORD_PORTARIA.lat, COORD_PORTARIA.lng], {
    radius: 8,
    fillColor: "#0ea5e9",
    color: "#ffffff",
    weight: 2,
    fillOpacity: 1,
  })
    .bindPopup("<b>Portaria Cisne Branco</b>")
    .addTo(camadaMarcadores);
}

function atualizarMapaPreview(listaDestinos) {
  if (!mapaLeaflet || !camadaMarcadores) return;

  if (window.innerWidth >= 900) {
    setTimeout(() => mapaLeaflet.invalidateSize(), 150);
  }
  desenharPortariaNoMapa();

  const pontosTrajeto = [[COORD_PORTARIA.lat, COORD_PORTARIA.lng]];

  listaDestinos.forEach((item, idx) => {
    const coord = extrairLatLng(item.coordenada);
    if (coord) {
      pontosTrajeto.push([coord.lat, coord.lng]);
      const tituloPopup = item.ehAreaComum
        ? `<b>${item.nomeArea}</b>`
        : `<b>${idx + 1}º Destino:</b> Lote ${item.lote} (${item.unidade})<br>Rua ${item.rua} | Lado ${item.lado}`;
      L.circleMarker([coord.lat, coord.lng], {
        radius: 9,
        fillColor: "#ef4444",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 1,
      })
        .bindPopup(tituloPopup)
        .addTo(camadaMarcadores)
        .openPopup();
    }
  });

  if (pontosTrajeto.length > 1) {
    const linhaRota = L.polyline(pontosTrajeto, {
      color: "#38bdf8",
      weight: 4,
      dashArray: "8, 6",
    }).addTo(camadaMarcadores);
    mapaLeaflet.fitBounds(linhaRota.getBounds(), {
      padding: [50, 50],
      maxZoom: 18,
    });
  }

  const infoBadge = document.getElementById("badge-mapa-info");
  if (listaDestinos.length === 1) {
    const d = listaDestinos[0];
    infoBadge.textContent = d.ehAreaComum
      ? d.nomeArea
      : `Lote ${d.lote} | Lado ${d.lado}`;
  } else {
    infoBadge.textContent = `${listaDestinos.length} paradas na rota`;
  }
}

function salvarFilaLocal() {
  localStorage.setItem("loc_ccb_fila", JSON.stringify(filaEntregas));
}

function carregarFilaLocal() {
  const salva = localStorage.getItem("loc_ccb_fila");
  if (salva) {
    filaEntregas = JSON.parse(salva);
    atualizarInterfaceFila();
  }
}

function adicionarNaFila() {
  if (!validarDeslocamento()) return;
  const casa = validarEmTempoReal();
  if (!casa) {
    mostrarErro("Digite um Lote válido antes de adicionar à fila.");
    return;
  }

  const jaExiste = filaEntregas.some(
    (item) => item.lote === casa.lote && item.unidade === casa.unidade,
  );
  if (jaExiste) {
    mostrarErro("Este endereço já está na lista.");
    return;
  }

  filaEntregas.push(casa);
  salvarFilaLocal();

  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  document.getElementById("sugestoes-unidades").style.display = "none";
  limparVisorRua();

  atualizarInterfaceFila();
  document.getElementById("lote").focus();
}

function removerDaFila(index) {
  filaEntregas.splice(index, 1);
  atualizarInterfaceFila();
  salvarFilaLocal();
}

function limparFila() {
  filaEntregas = [];
  atualizarInterfaceFila();
  salvarFilaLocal();
  document.getElementById("resultado").style.display = "none";
  const btnLimparPc = document.getElementById("btn-limpar-pc");
  if (btnLimparPc) btnLimparPc.style.display = "none";
}

function atualizarInterfaceFila() {
  const container = document.getElementById("fila-container");
  const lista = document.getElementById("lista-fila");
  const contador = document.getElementById("contador-fila");
  const btnLocalizar = document.getElementById("btn-localizar");

  lista.innerHTML = "";
  contador.textContent = filaEntregas.length;

  if (filaEntregas.length === 0) {
    container.style.display = "none";
    btnLocalizar.textContent = "Localizar Endereço";
  } else {
    container.style.display = "block";
    btnLocalizar.textContent =
      filaEntregas.length === 1
        ? "Gerar Rota (1 Endereço)"
        : `Finalizar e Gerar Rotas (${filaEntregas.length} Endereços)`;
  }

  atualizarEstadoBotoesAcao();

  const iconeLixeiraSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

  filaEntregas.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item-fila";
    const desc = item.ehAreaComum
      ? `<strong>Área Comum</strong> - ${item.nomeArea}`
      : `<strong>Lado ${item.lado}</strong> | R.${item.rua} - Lote ${item.lote} (${item.unidade})`;
    li.innerHTML = `<span>${desc}</span><button class="btn-remover" onclick="removerDaFila(${index})" title="Remover item">${iconeLixeiraSVG}</button>`;
    lista.appendChild(li);
  });
}

function registrarHistorico(lista) {
  if (lista.length === 0) return;

  const ua = navigator.userAgent;
  let tipoAparelho = "Computador (PC)";
  if (/android/i.test(ua)) tipoAparelho = "Celular (Android)";
  else if (/iphone|ipad|ipod/i.test(ua)) tipoAparelho = "Celular (iPhone)";
  else if (/mobile/i.test(ua)) tipoAparelho = "Celular (Outros)";

  const nomesModo = {
    driving: "Carro",
    "two-wheeler": "Moto",
    walking: "A pé",
  };
  const transporte = nomesModo[modoViagemSelecionado] || modoViagemSelecionado;
  const placa =
    modoViagemSelecionado === "walking"
      ? "Sem placa (A pé)"
      : document.getElementById("placa").value.toUpperCase();
  const nome = document
    .getElementById("nome-visitante")
    .value.trim()
    .toUpperCase();

  const docTipo = modoViagemSelecionado === "walking" ? "ID" : "CNH";
  const cnh =
    window.innerWidth < 900 ? "N/A (Celular)" : `${docTipo}: ${cnhSelecionada}`;
  const docEnvio = modoOutrosAtivo ? "Outros" : documentoAtual;

  fetch(URL_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
      documento: docEnvio,
      aparelho: tipoAparelho,
      nome,
      perfil: perfilSelecionado,
      cnh,
      transporte,
      placa,
      fila: lista,
    }),
  }).then(() => {
    if (window.innerWidth >= 900) {
      setTimeout(carregarUltimosAcessos, 2000);
    }
  });
}

async function carregarUltimosAcessos() {
  if (window.innerWidth < 900) return;
  const ul = document.getElementById("lista-ultimos-acessos");
  const spanContador = document.getElementById("contador-acessos-dia");
  if (!ul) return;

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("Histórico")}`;

  try {
    const resp = await fetch(url);
    const txt = await resp.text();
    const jsonStr = txt.substring(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
    const dados = JSON.parse(jsonStr);

    const hoje = new Date();
    const linhasDoDia = [];
    historicoAcessosCache = [];
    historicoPorCpf = {};

    dados.table.rows.forEach((r) => {
      if (!r.c || !r.c[0]) return;
      const strData = obterValorCelula(r.c[0]);
      const dataReg = parseDataPlanilha(r.c[0], strData);

      const totalCols = r.c.length;
      let docRaw = "";
      let nome = "Visitante";
      let perfil = "";
      let cnh = "";
      let transporte = "";
      let placa = "";
      let enderecos = "";

      if (totalCols >= 9) {
        docRaw = obterValorCelula(r.c[1]);
        nome = obterValorCelula(r.c[3]) || "Visitante";
        perfil = obterValorCelula(r.c[4]);
        cnh = obterValorCelula(r.c[5]);
        transporte = obterValorCelula(r.c[6]);
        placa = obterValorCelula(r.c[7]);
        enderecos = obterValorCelula(r.c[8]);
      } else if (totalCols === 8) {
        nome = obterValorCelula(r.c[2]) || "Visitante";
        perfil = obterValorCelula(r.c[3]);
        cnh = obterValorCelula(r.c[4]);
        transporte = obterValorCelula(r.c[5]);
        placa = obterValorCelula(r.c[6]);
        enderecos = obterValorCelula(r.c[7]);
      } else {
        nome = "Visitante";
        transporte = obterValorCelula(r.c[2]);
        placa = obterValorCelula(r.c[3]);
        enderecos = obterValorCelula(r.c[4]);
      }

      let cpfLimpo = docRaw.replace(/\D/g, "");
      if (cpfLimpo.length >= 8 && cpfLimpo.length < 11) {
        cpfLimpo = cpfLimpo.padStart(11, "0");
      }

      const modoCod = converterTransporteParaModo(transporte);
      const placaValida =
        placa && !placa.includes("Sem placa") ? placa.toUpperCase() : "";

      if (cpfLimpo.length === 11) {
        if (!historicoPorCpf[cpfLimpo]) {
          historicoPorCpf[cpfLimpo] = {
            nome,
            perfil,
            ultimoModo: modoCod,
            placasPorModo: {},
            ultimoDestinoStr: enderecos,
            ultimoDestinoObj: parseDestinoObj(enderecos),
          };
        } else {
          historicoPorCpf[cpfLimpo].nome = nome;
          if (perfil) historicoPorCpf[cpfLimpo].perfil = perfil;
          historicoPorCpf[cpfLimpo].ultimoModo = modoCod;
          historicoPorCpf[cpfLimpo].ultimoDestinoStr = enderecos;
          historicoPorCpf[cpfLimpo].ultimoDestinoObj =
            parseDestinoObj(enderecos);
        }
        if (
          placaValida &&
          (modoCod === "driving" || modoCod === "two-wheeler")
        ) {
          historicoPorCpf[cpfLimpo].placasPorModo[modoCod] = placaValida;
        }
      }

      if (placaValida) {
        const placaLimpa = placaValida.replace(/[^A-Z0-9]/g, "");
        const idx = historicoAcessosCache.findIndex(
          (item) => item.placa.replace(/[^A-Z0-9]/g, "") === placaLimpa,
        );
        if (idx !== -1) {
          historicoAcessosCache[idx] = {
            nome,
            perfil,
            cnh,
            placa: placaValida,
          };
        } else {
          historicoAcessosCache.push({ nome, perfil, cnh, placa: placaValida });
        }
      }

      if (dataReg && dataReg.toDateString() === hoje.toDateString()) {
        linhasDoDia.push({
          hora: dataReg.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          nome,
          perfil,
          transporte,
          placa,
          enderecos,
        });
      }
    });

    linhasDoDia.reverse();
    ul.innerHTML = "";
    if (spanContador) spanContador.textContent = linhasDoDia.length;

    if (linhasDoDia.length === 0) {
      ul.innerHTML = `<li class="item-vazio">Nenhum acesso registrado hoje.</li>`;
      return;
    }

    linhasDoDia.forEach((item) => {
      const li = document.createElement("li");
      li.className = "item-ultimo-acesso";
      const tagPlaca =
        item.placa && !item.placa.includes("Sem placa")
          ? ` (${item.placa})`
          : "";
      const tagPerfil = item.perfil ? ` • ${item.perfil}` : "";

      li.innerHTML = `
        <div class="linha-topo-acesso">
          <span>${item.nome}${tagPerfil}</span>
          <span class="hora-acesso">${item.hora}</span>
        </div>
        <div class="linha-base-acesso">
          ${item.transporte}${tagPlaca} ➔ ${item.enderecos}
        </div>
      `;
      li.onclick = () => visualizarAcessoNoMapa(item.enderecos);
      ul.appendChild(li);
    });
  } catch (e) {
    ul.innerHTML = `<li class="item-vazio">Não foi possível atualizar a lista.</li>`;
  }
}

function parseDestinoObj(strEnderecos) {
  if (!strEnderecos) return null;
  const primeiraParte = strEnderecos.split(" | ")[0].trim();
  if (primeiraParte.startsWith("Área Comum:")) {
    const nomeA = primeiraParte.replace("Área Comum:", "").trim().toLowerCase();
    return (
      baseAreasComuns.find((a) => a.nomeArea.toLowerCase() === nomeA) || null
    );
  } else {
    const mLote = primeiraParte.match(/Lote\s+(\d+)/i);
    const mUnid = primeiraParte.match(/\(Unid\s+([^)]+)\)/i);
    if (mLote) {
      const numLote = mLote[1];
      const unidBusca = mUnid ? mUnid[1].trim() : "-";
      const lotesCandidatos = baseEnderecos.filter(
        (e) => String(Number(e.lote)) === String(Number(numLote)),
      );
      const exato =
        lotesCandidatos.find(
          (e) => String(e.unidade).toLowerCase() === unidBusca.toLowerCase(),
        ) || lotesCandidatos[0];
      if (exato) {
        return { ...exato, unidade: mUnid ? unidBusca : "Portão do Lote" };
      }
    }
  }
  return null;
}

function parseDataPlanilha(celulaObj, strFallback) {
  if (
    celulaObj &&
    typeof celulaObj.v === "string" &&
    celulaObj.v.startsWith("Date(")
  ) {
    const nums = celulaObj.v
      .replace("Date(", "")
      .replace(")", "")
      .split(",")
      .map(Number);
    return new Date(
      nums[0],
      nums[1],
      nums[2],
      nums[3] || 0,
      nums[4] || 0,
      nums[5] || 0,
    );
  }
  const match = strFallback.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
    );
  }
  return null;
}

function visualizarAcessoNoMapa(strEnderecos) {
  if (!strEnderecos) return;
  const partes = strEnderecos.split(" | ");
  const destinosEncontrados = [];

  partes.forEach((p) => {
    if (p.startsWith("Área Comum:")) {
      const nomeA = p.replace("Área Comum:", "").trim().toLowerCase();
      const areaObj = baseAreasComuns.find(
        (a) => a.nomeArea.toLowerCase() === nomeA,
      );
      if (areaObj) destinosEncontrados.push(areaObj);
    } else {
      const mLote = p.match(/Lote\s+(\d+)/i);
      const mUnid = p.match(/\(Unid\s+([^)]+)\)/i);
      if (mLote) {
        const numLote = mLote[1];
        const unidBusca = mUnid ? mUnid[1].trim() : "-";
        const lotesCandidatos = baseEnderecos.filter(
          (e) => String(Number(e.lote)) === String(Number(numLote)),
        );
        const exato =
          lotesCandidatos.find(
            (e) => String(e.unidade).toLowerCase() === unidBusca.toLowerCase(),
          ) || lotesCandidatos[0];
        if (exato) {
          destinosEncontrados.push({
            ...exato,
            unidade: mUnid ? unidBusca : "Portão do Lote",
          });
        }
      }
    }
  });

  if (destinosEncontrados.length > 0) {
    atualizarMapaPreview(destinosEncontrados);
  }
}

function processarRotas(listaForcada = null) {
  esconderErro();
  if (!validarDeslocamento()) return;

  let listaFinal = listaForcada ? [...listaForcada] : [...filaEntregas];

  if (!listaForcada) {
    const casaAtual = validarEmTempoReal();
    if (casaAtual) {
      const jaExiste = listaFinal.some(
        (item) =>
          item.lote === casaAtual.lote && item.unidade === casaAtual.unidade,
      );
      if (!jaExiste) listaFinal.push(casaAtual);
    }
  }

  if (listaFinal.length === 0) {
    mostrarErro("Digite ao menos um Lote válido ou selecione uma Área Comum.");
    return;
  }

  listaFinal.sort((a, b) => {
    const ladoA = (a.lado || "").trim().charAt(0).toUpperCase();
    const ladoB = (b.lado || "").trim().charAt(0).toUpperCase();
    if (ladoA !== ladoB) return ladoA.localeCompare(ladoB);
    if (a.rua !== b.rua) return a.rua - b.rua;
    return Number(a.lote) - Number(b.lote);
  });

  registrarHistorico(listaFinal);
  atualizarMapaPreview(listaFinal);

  const ehCelular = window.innerWidth < 900;
  const sufixoQr = `&travelmode=${modoViagemSelecionado}&dir_action=navigate`;
  const sufixoBotao = ehCelular
    ? `&travelmode=${modoViagemSelecionado}&dir_action=navigate`
    : `&travelmode=${modoViagemSelecionado}`;

  const divResultado = document.getElementById("resultado");
  const containerResultados = document.getElementById("lista-resultados-qr");
  containerResultados.innerHTML = "";
  divResultado.style.display = "block";

  const btnLimparPc = document.getElementById("btn-limpar-pc");
  if (btnLimparPc && window.innerWidth >= 900) {
    btnLimparPc.style.display = "block";
  }

  const bloco = listaFinal;
  const ultimoPonto = encodeURIComponent(
    formatarDestinoMaps(bloco[bloco.length - 1].coordenada),
  );

  let urlQrCode = "";
  let urlBotao = "";

  if (bloco.length === 1) {
    urlQrCode = `https://www.google.com/maps/dir/?api=1&destination=${ultimoPonto}${sufixoQr}`;
    urlBotao = `https://www.google.com/maps/dir/?api=1&destination=${ultimoPonto}${sufixoBotao}`;
  } else {
    const paradas = bloco
      .slice(0, -1)
      .map((item) => encodeURIComponent(formatarDestinoMaps(item.coordenada)))
      .join("|");
    urlQrCode = `https://www.google.com/maps/dir/?api=1&waypoints=${paradas}&destination=${ultimoPonto}${sufixoQr}`;
    urlBotao = `https://www.google.com/maps/dir/?api=1&waypoints=${paradas}&destination=${ultimoPonto}${sufixoBotao}`;
  }

  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  limparVisorRua();
  document.getElementById("sugestoes-unidades").style.display = "none";
  atualizarEstadoBotoesAcao();

  const blocoDiv = document.createElement("div");
  blocoDiv.className = "bloco-qr-item";

  let tituloBloco = "";
  if (listaFinal.length === 1) {
    const itemUnico = bloco[0];
    tituloBloco = itemUnico.ehAreaComum
      ? `Destino: ${itemUnico.nomeArea}`
      : `Destino: Lote ${itemUnico.lote} (${itemUnico.unidade})`;
  } else {
    tituloBloco = `Rota Otimizada (${bloco.length} Entregas)`;
  }

  const qrId = `qrcode-bloco-1`;
  const textoBotao =
    listaFinal.length === 1
      ? "Abrir direto no Google Maps"
      : `Abrir Rota no Google Maps (${bloco.length} paradas)`;

  blocoDiv.innerHTML = `
    <p class="titulo-destino-qr">${tituloBloco}</p>
    <div id="${qrId}" class="qrcode-box"></div>
    <p class="dica-qr">Aponte a câmera do celular para abrir a rota</p>
    <a href="${urlBotao}" target="_blank" class="btn-maps" onclick="limparSelecaoCompleta()">${textoBotao}</a>
  `;

  containerResultados.appendChild(blocoDiv);
  new QRCode(document.getElementById(qrId), {
    text: urlQrCode,
    width: 175,
    height: 175,
    correctLevel: QRCode.CorrectLevel.L,
  });

  if (!listaForcada) {
    filaEntregas = [];
    salvarFilaLocal();
    atualizarInterfaceFila();
  }
}

function limparSelecaoCompleta() {
  const ehCelular = window.innerWidth < 900;

  if (!ehCelular) {
    const inputDoc = document.getElementById("documento-cpf");
    const inputPlaca = document.getElementById("placa");
    const inputNome = document.getElementById("nome-visitante");

    inputDoc.value = "";
    inputDoc.classList.remove("preenchido");
    if (inputPlaca) {
      inputPlaca.value = "";
      inputPlaca.classList.remove("preenchido");
    }
    if (inputNome) {
      inputNome.value = "";
      inputNome.classList.remove("preenchido");
    }

    documentoAtual = "";
    modoOutrosAtivo = false;
    perfilSelecionado = "";
    cnhSelecionada = "";
    document.getElementById("btn-doc-outros").classList.remove("ativo");
    document.getElementById("bloco-pos-documento").style.display = "none";
    document.getElementById("box-atalho-destino").style.display = "none";
    document
      .querySelectorAll(".btn-chip-acesso")
      .forEach((b) => b.classList.remove("ativo"));
  }

  modoViagemSelecionado = "";
  deslocamentoConfirmado = false;
  document
    .querySelectorAll(".btn-modo")
    .forEach((btn) => btn.classList.remove("ativo"));

  document.getElementById("card-deslocamento").classList.remove("recolhido");
  document.getElementById("corpo-deslocamento").style.display = "flex";
  document.getElementById("dados-acesso-extra").style.display = "none";
  document.getElementById("resumo-deslocamento").style.display = "none";
  const tagObrig = document.getElementById("tag-obrigatorio");
  if (tagObrig) tagObrig.style.display = "inline";

  document.getElementById("sessao-busca").style.display = "none";
  document.getElementById("resultado").style.display = "none";
  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  limparVisorRua();
  document.getElementById("sugestoes-unidades").style.display = "none";

  const btnLimparPc = document.getElementById("btn-limpar-pc");
  if (btnLimparPc) btnLimparPc.style.display = "none";

  atualizarEstadoBotoesAcao();

  if (!ehCelular) {
    setTimeout(() => document.getElementById("documento-cpf").focus(), 50);
  }
}

function mostrarErro(msg) {
  const divErro = document.getElementById("erro");
  divErro.textContent = msg;
  divErro.style.display = "block";
}

function esconderErro() {
  document.getElementById("erro").style.display = "none";
}
