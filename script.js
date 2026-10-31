const SHEET_ID = "1QDUCLr8tZzTbxc1dwSf0Pl-0U7MjGyu7IzCgq95za1o";
const NOME_ABA = "Cadastro";
const URL_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwwYNic6HrlhNeps58h2MERfJZ-DOcfXm2wbfPWRoAP1wKvWsrYVCbqf_kcuduSjzNw/exec";

let COORD_PORTARIA = { lat: -22.816945097334372, lng: -42.088560977464915 };

let baseEnderecos = [];
let baseAreasComuns = [];
let filaEntregas = [];
let mapaLeaflet = null;
let camadaMarcadores = null;
let modoViagemSelecionado = "";

window.onload = async () => {
  await carregarPlanilha();
  configurarBotaoPortaria();
  inicializarMapaPC();
  carregarFilaLocal();
  carregarUltimaPlaca();
  atualizarEstadoBotoesAcao();
};

function ehDispositivoMovel() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function selecionarModo(modo) {
  esconderErro();
  modoViagemSelecionado = modo;

  document
    .querySelectorAll(".btn-modo")
    .forEach((btn) => btn.classList.remove("ativo"));
  const btnAtivo = document.getElementById(`modo-${modo}`);
  if (btnAtivo) btnAtivo.classList.add("ativo");

  const boxPlaca = document.getElementById("box-placa");
  if (modo === "driving" || modo === "two-wheeler") {
    boxPlaca.style.display = "flex";
    carregarUltimaPlaca();
  } else {
    boxPlaca.style.display = "none";
    const inputPlaca = document.getElementById("placa");
    if (inputPlaca) inputPlaca.value = "";
  }
  configurarBotaoPortaria();
}

function formatarPlaca() {
  esconderErro();
  const input = document.getElementById("placa");
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function carregarUltimaPlaca() {
  const inputPlaca = document.getElementById("placa");
  if (!inputPlaca) return;

  if (!ehDispositivoMovel()) {
    inputPlaca.value = "";
    return;
  }

  const ultima = localStorage.getItem("loc_ccb_ultima_placa");
  if (ultima && !inputPlaca.value) {
    inputPlaca.value = ultima;
  }
}

function validarDeslocamento() {
  if (!modoViagemSelecionado) {
    mostrarErro(
      "Selecione o Tipo de Deslocamento (Carro, Moto ou A pé) acima.",
    );
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
    if (ehDispositivoMovel()) {
      localStorage.setItem("loc_ccb_ultima_placa", placaLimpa);
    }
  }
  return true;
}

function obterValorCelula(celula) {
  if (!celula) return "";
  if (celula.v !== null && celula.v !== undefined)
    return String(celula.v).trim();
  if (celula.f !== null && celula.f !== undefined)
    return String(celula.f).trim();
  return "";
}

async function carregarPlanilha() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(NOME_ABA)}`;

  try {
    const resposta = await fetch(url);
    const texto = await resposta.text();
    const jsonString = texto.substring(
      texto.indexOf("{"),
      texto.lastIndexOf("}") + 1,
    );
    const dados = JSON.parse(jsonString);

    // Mapeamento dos Lotes (Colunas A a E - Índices 0 a 4)
    baseEnderecos = dados.table.rows
      .map((linha) => {
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
          item.lote !== "" &&
          item.lote.toUpperCase() !== "LOTE" &&
          item.coordenada !== "",
      );

    // Mapeamento das Áreas Comuns (Colunas H a K - Índices 7 a 10)
    baseAreasComuns = dados.table.rows
      .map((linha) => {
        // A API gviz às vezes reduz o array 'c' se as células da direita estiverem vazias.
        if (linha.c.length <= 10) return null;

        const tipoArea = obterValorCelula(linha.c[7]); // H
        const nomeArea = obterValorCelula(linha.c[8]); // I
        const ladoArea = obterValorCelula(linha.c[9]); // J
        const coordenadaArea = obterValorCelula(linha.c[10]); // K

        if (!tipoArea || (tipoArea.toUpperCase() === "ÁREA COMUM" && !nomeArea))
          return null;

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

    // Define a portaria a partir da base de áreas comuns
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
  const box = document.getElementById("chips-areas-comuns");
  box.style.display = box.style.display === "none" ? "flex" : "none";
}

function renderizarBotoesAreasComuns() {
  const container = document.getElementById("chips-areas-comuns");
  container.innerHTML = "";

  const areasUnicas = [];
  const coordsUsadas = new Set();

  // Utiliza a base específica de Áreas Comuns
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

  if (!validarDeslocamento()) return;

  const btnLocalizar = document.getElementById("btn-localizar");
  if (btnLocalizar) {
    btnLocalizar.classList.remove("desativado");
    btnLocalizar.removeAttribute("disabled");
  }

  processarRotas([areaObj]);
}

function atualizarEstadoBotoesAcao() {
  const loteVal = document.getElementById("lote").value.trim();
  const btnAdd = document.getElementById("btn-add-fila");
  const btnLocalizar = document.getElementById("btn-localizar");

  if (loteVal.length > 0) {
    if (btnAdd) {
      btnAdd.classList.remove("desativado");
      btnAdd.removeAttribute("disabled");
    }
    if (btnLocalizar) {
      btnLocalizar.classList.remove("desativado");
      btnLocalizar.removeAttribute("disabled");
    }
  } else {
    if (btnAdd) {
      btnAdd.classList.add("desativado");
      btnAdd.setAttribute("disabled", "true");
    }
    if (btnLocalizar) {
      btnLocalizar.classList.add("desativado");
      btnLocalizar.setAttribute("disabled", "true");
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
    if (
      unidExata.lado.toLowerCase().includes("terreno") ||
      unidExata.lado.toLowerCase().includes("vazio")
    ) {
      mostrarErro(
        `Atenção: A Unid. ${unidExata.unidade} consta como "${unidExata.lado}".`,
      );
    }
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

  document.getElementById("painel-mapa").style.display = "flex";
  setTimeout(() => mapaLeaflet.invalidateSize(), 150);
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
  atualizarInterfaceFila();
  salvarFilaLocal();
  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  document.getElementById("sugestoes-unidades").style.display = "none";
  limparVisorRua();
  atualizarEstadoBotoesAcao();
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
    return;
  }

  container.style.display = "block";
  btnLocalizar.textContent =
    filaEntregas.length === 1
      ? "Gerar Rota (1 Endereço)"
      : `Finalizar e Gerar Rotas (${filaEntregas.length} Endereços)`;
  btnLocalizar.classList.remove("desativado");
  btnLocalizar.removeAttribute("disabled");

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

  fetch(URL_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
      aparelho: `${tipoAparelho} | ${transporte} (${placa})`,
      transporte,
      placa,
      fila: lista,
    }),
  });
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

  const ehCelular = ehDispositivoMovel();
  const sufixoQr = `&travelmode=${modoViagemSelecionado}&dir_action=navigate`;
  const sufixoBotao = ehCelular
    ? `&travelmode=${modoViagemSelecionado}&dir_action=navigate`
    : `&travelmode=${modoViagemSelecionado}`;

  const divResultado = document.getElementById("resultado");
  const containerResultados = document.getElementById("lista-resultados-qr");
  containerResultados.innerHTML = "";
  divResultado.style.display = "block";

  const btnLimparPc = document.getElementById("btn-limpar-pc");
  if (btnLimparPc && !ehCelular) {
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
  }
}

function limparSelecaoCompleta() {
  const inputPlaca = document.getElementById("placa");
  if (inputPlaca) inputPlaca.value = "";

  modoViagemSelecionado = "";
  document
    .querySelectorAll(".btn-modo")
    .forEach((btn) => btn.classList.remove("ativo"));
  document.getElementById("box-placa").style.display = "none";

  document.getElementById("resultado").style.display = "none";
  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  limparVisorRua();
  document.getElementById("sugestoes-unidades").style.display = "none";

  const btnLimparPc = document.getElementById("btn-limpar-pc");
  if (btnLimparPc) btnLimparPc.style.display = "none";

  atualizarEstadoBotoesAcao();
  document.getElementById("lote").focus();
}

function mostrarErro(msg) {
  const divErro = document.getElementById("erro");
  divErro.textContent = msg;
  divErro.style.display = "block";
}

function esconderErro() {
  document.getElementById("erro").style.display = "none";
}
