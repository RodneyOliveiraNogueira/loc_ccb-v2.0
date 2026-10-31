const SHEET_ID = "1QDUCLr8tZzTbxc1dwSf0Pl-0U7MjGyu7IzCgq95za1o";
const NOME_ABA = "Cadastro";

const URL_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbyH_p9xjMHImhCTg0QH3bo0S1M51k5g2enI1fmoP92iR05iHI3geaQEv8bfJuCKmipR/exec";

let COORD_PORTARIA = { lat: -22.816945097334372, lng: -42.088560977464915 };

let baseEnderecos = [];
let filaEntregas = [];
let mapaLeaflet = null;
let camadaMarcadores = null;

window.onload = async () => {
  await carregarPlanilha();
  configurarBotaoPortaria();
  inicializarMapaPC();
  renderizarBotoesAreasComuns();
  carregarFilaLocal();
};

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

    baseEnderecos = dados.table.rows
      .map((linha) => {
        const lote = obterValorCelula(linha.c[0]);
        const unidade = obterValorCelula(linha.c[1]);
        const ruaTexto = obterValorCelula(linha.c[2]);
        const lado = obterValorCelula(linha.c[3]);
        const coordenada = obterValorCelula(linha.c[4]);

        const ehAreaComum =
          lote === "0" || unidade.toLowerCase().includes("comum");

        return {
          lote,
          unidade: ehAreaComum && ruaTexto ? ruaTexto : unidade,
          nomeArea: ehAreaComum ? ruaTexto || unidade : "",
          rua: !ehAreaComum && !isNaN(Number(ruaTexto)) ? Number(ruaTexto) : 0,
          lado: lado || "A",
          coordenada,
          ehAreaComum,
        };
      })
      .filter(
        (item) =>
          item.lote !== "" &&
          item.lote.toUpperCase() !== "LOTE" &&
          item.coordenada !== "",
      );

    const itemPortaria = baseEnderecos.find(
      (item) =>
        item.ehAreaComum && item.nomeArea.toLowerCase().includes("portaria"),
    );
    if (itemPortaria) {
      const coordP = extrairLatLng(itemPortaria.coordenada);
      if (coordP) COORD_PORTARIA = coordP;
    }
  } catch (erro) {
    mostrarErro("Erro ao conectar com a planilha. Verifique a conexão.");
  }
}

function configurarBotaoPortaria() {
  const btnPortaria = document.getElementById("btn-rota-portaria");
  if (btnPortaria) {
    const dest = `${COORD_PORTARIA.lat},${COORD_PORTARIA.lng}`;
    btnPortaria.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
  }
}

/* --- ÁREAS COMUNS CLICÁVEIS (SEM POLUIR OS CAMPOS LOTE/UNIDADE/RUA) --- */
function alternarAreasComuns() {
  const box = document.getElementById("chips-areas-comuns");
  box.style.display = box.style.display === "none" ? "flex" : "none";
}

function renderizarBotoesAreasComuns() {
  const container = document.getElementById("chips-areas-comuns");
  container.innerHTML = "";

  let areas = baseEnderecos.filter((item) => item.ehAreaComum);

  if (
    areas.length === 0 ||
    areas.every((a) => a.nomeArea.toLowerCase().includes("comum"))
  ) {
    areas = [
      {
        lote: "0",
        unidade: "Portaria",
        nomeArea: "Portaria",
        rua: 0,
        lado: "A",
        coordenada: "-22.816945097334372, -42.088560977464915",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Administração",
        nomeArea: "Administração",
        rua: 0,
        lado: "A",
        coordenada: "-22.816859510295053, -42.0883086570228",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Espaço Festas ADM",
        nomeArea: "Espaço Festas ADM",
        rua: 0,
        lado: "A",
        coordenada: "-22.8167254391533, -42.08809486225953",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Barracão Func.",
        nomeArea: "Barracão Func.",
        rua: 0,
        lado: "A",
        coordenada: "-22.817074545064035, -42.0876265635907",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Quadra Poliesportiva",
        nomeArea: "Quadra Poliesportiva",
        rua: 0,
        lado: "A",
        coordenada: "-22.81792444296317, -42.08593993180652",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Espaço de Eventos",
        nomeArea: "Espaço de Eventos",
        rua: 0,
        lado: "A",
        coordenada: "-22.818043792675315, -42.085654190950194",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Quadra de Areia",
        nomeArea: "Quadra de Areia",
        rua: 0,
        lado: "A",
        coordenada: "-22.81818879699076, -42.08529155265206",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Campo de Futebol",
        nomeArea: "Campo de Futebol",
        rua: 0,
        lado: "A",
        coordenada: "-22.81832048810733, -42.085001525097276",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Salão de Festas",
        nomeArea: "Salão de Festas",
        rua: 0,
        lado: "A",
        coordenada: "-22.819738216303996, -42.085720921292456",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Academia",
        nomeArea: "Academia",
        rua: 0,
        lado: "A",
        coordenada: "-22.820399348673437, -42.08531248352125",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Salão de Jogos",
        nomeArea: "Salão de Jogos",
        rua: 0,
        lado: "A",
        coordenada: "-22.820399348673437, -42.08531248352125",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Salão de Lutas",
        nomeArea: "Salão de Lutas",
        rua: 0,
        lado: "A",
        coordenada: "-22.820399348673437, -42.08531248352125",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Balé",
        nomeArea: "Balé",
        rua: 0,
        lado: "A",
        coordenada: "-22.819738216303996, -42.085720921292456",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Piscinas",
        nomeArea: "Piscinas",
        rua: 0,
        lado: "A",
        coordenada: "-22.819738216303996, -42.085720921292456",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Portão dos Fundos (Dentro)",
        nomeArea: "Portão dos Fundos (Dentro)",
        rua: 0,
        lado: "A",
        coordenada: "-22.820063013011307, -42.07928783365731",
        ehAreaComum: true,
      },
      {
        lote: "0",
        unidade: "Portão dos Fundos (Fora)",
        nomeArea: "Portão dos Fundos (Fora)",
        rua: 0,
        lado: "-",
        coordenada: "-22.820241572989445, -42.07899375869883",
        ehAreaComum: true,
      },
    ];
  }

  areas.forEach((area) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-btn area-comum";
    btn.textContent = area.nomeArea;
    btn.onclick = () => selecionarAreaComum(area);
    container.appendChild(btn);
  });
}

function selecionarAreaComum(areaObj) {
  // Limpa os campos de Lote, Unidade e Rua/Lado para não espremer o texto da Área Comum ali dentro
  document.getElementById("lote").value = "";
  document.getElementById("unidade").value = "";
  limparVisorRua();
  document.getElementById("sugestoes-unidades").style.display = "none";
  document.getElementById("chips-areas-comuns").style.display = "none";
  processarRotas([areaObj]);
}

/* --- DIGITAÇÃO DO LOTE E SUGESTÃO DE UNIDADES CLICÁVEIS --- */
function aoDigitarLote() {
  esconderErro();
  const inputLote = document.getElementById("lote");
  inputLote.value = inputLote.value.replace(/\D/g, "");
  const loteDigitado = inputLote.value.trim();

  const boxSugestoes = document.getElementById("sugestoes-unidades");
  const containerChips = document.getElementById("lista-chips-unidades");

  if (!loteDigitado || loteDigitado === "0") {
    boxSugestoes.style.display = "none";
    limparVisorRua();
    return;
  }

  const registrosDoLote = baseEnderecos.filter(
    (item) =>
      !item.ehAreaComum &&
      String(Number(item.lote)) === String(Number(loteDigitado)),
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
  const txtRua = document.getElementById("txt-rua");
  const txtLado = document.getElementById("txt-lado");

  txtRua.textContent = item.rua > 0 ? `Rua ${item.rua}` : `Lote ${item.lote}`;
  txtLado.textContent = item.lado.startsWith("Lado")
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
    (item) =>
      !item.ehAreaComum && String(Number(item.lote)) === String(Number(lote)),
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
    return {
      ...linhaMestraLote,
      unidade: "Portão do Lote",
    };
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

/* --- FORMATAÇÃO DE COORDENADAS --- */
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

/* --- MAPA INTERATIVO AMPLIADO NA DIREITA --- */
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

/* --- FILA, LOCAL STORAGE E ÍCONE DE LIXEIRA --- */
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

  const iconeLixeiraSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  `;

  filaEntregas.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item-fila";
    const desc = item.ehAreaComum
      ? `<strong>Área Comum</strong> - ${item.nomeArea}`
      : `<strong>Lado ${item.lado}</strong> | R.${item.rua} - Lote ${item.lote} (${item.unidade})`;

    li.innerHTML = `
      <span>${desc}</span>
      <button class="btn-remover" onclick="removerDaFila(${index})" title="Remover item">${iconeLixeiraSVG}</button>
    `;
    lista.appendChild(li);
  });
}

/* --- AUDITORIA (HISTÓRICO) E GERAÇÃO DE ROTAS COM QR CODE PARA 1 OU MAIS ENDEREÇOS --- */
function registrarHistorico(lista) {
  if (lista.length === 0) return;

  const ua = navigator.userAgent;
  let tipoAparelho = "Computador (PC)";
  if (/android/i.test(ua)) tipoAparelho = "Celular (Android)";
  else if (/iphone|ipad|ipod/i.test(ua)) tipoAparelho = "Celular (iPhone)";
  else if (/mobile/i.test(ua)) tipoAparelho = "Celular (Outros)";

  fetch(URL_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ aparelho: tipoAparelho, fila: lista }),
  });
}

function processarRotas(listaForcada = null) {
  esconderErro();

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

  // Ordenação inteligente: Lado A -> Lado B -> Rua -> Lote
  listaFinal.sort((a, b) => {
    const ladoA = (a.lado || "").trim().charAt(0).toUpperCase();
    const ladoB = (b.lado || "").trim().charAt(0).toUpperCase();
    if (ladoA !== ladoB) return ladoA.localeCompare(ladoB);
    if (a.rua !== b.rua) return a.rua - b.rua;
    return Number(a.lote) - Number(b.lote);
  });

  registrarHistorico(listaFinal);
  atualizarMapaPreview(listaFinal);

  const ehCelular = /android|iphone|ipad|ipod|mobile/i.test(
    navigator.userAgent,
  );
  const sufixoBotao = ehCelular
    ? "&travelmode=driving&dir_action=navigate"
    : "&travelmode=driving";

  const divResultado = document.getElementById("resultado");
  const containerResultados = document.getElementById("lista-resultados-qr");
  containerResultados.innerHTML = "";
  divResultado.style.display = "block";

  // Divide em blocos de até 10 paradas e gera QR Code + Botão para cada bloco
  const tamanhoBloco = 10;
  for (let i = 0; i < listaFinal.length; i += tamanhoBloco) {
    const bloco = listaFinal.slice(i, i + tamanhoBloco);
    const numRota = Math.floor(i / tamanhoBloco) + 1;
    const ultimoPonto = encodeURIComponent(
      formatarDestinoMaps(bloco[bloco.length - 1].coordenada),
    );

    let urlQrCode = "";
    let urlBotao = "";

    if (bloco.length === 1) {
      urlQrCode = `https://www.google.com/maps/dir/?api=1&destination=${ultimoPonto}&travelmode=driving&dir_action=navigate`;
      urlBotao = `https://www.google.com/maps/dir/?api=1&destination=${ultimoPonto}${sufixoBotao}`;
    } else {
      const paradas = bloco
        .slice(0, -1)
        .map((item) => encodeURIComponent(formatarDestinoMaps(item.coordenada)))
        .join("|");
      urlQrCode = `https://www.google.com/maps/dir/?api=1&waypoints=${paradas}&destination=${ultimoPonto}&travelmode=driving&dir_action=navigate`;
      urlBotao = `https://www.google.com/maps/dir/?api=1&waypoints=${paradas}&destination=${ultimoPonto}${sufixoBotao}`;
    }

    const blocoDiv = document.createElement("div");
    blocoDiv.className = "bloco-qr-item";

    let tituloBloco = "";
    if (listaFinal.length === 1) {
      const itemUnico = bloco[0];
      tituloBloco = itemUnico.ehAreaComum
        ? `Destino: ${itemUnico.nomeArea}`
        : `Destino: Lote ${itemUnico.lote} (${itemUnico.unidade})`;
    } else if (listaFinal.length <= 10) {
      tituloBloco = `Rota Otimizada (${bloco.length} Entregas)`;
    } else {
      tituloBloco = `Rota ${numRota} (Entregas ${i + 1} a ${i + bloco.length})`;
    }

    const qrId = `qrcode-bloco-${numRota}`;
    const textoBotao =
      listaFinal.length === 1
        ? "Abrir direto no Google Maps"
        : `Abrir Rota no Google Maps (${bloco.length} paradas)`;

    blocoDiv.innerHTML = `
      <p class="titulo-destino-qr">${tituloBloco}</p>
      <div id="${qrId}" class="qrcode-box"></div>
      <p class="dica-qr">Aponte a câmera do celular para abrir a rota</p>
      <a href="${urlBotao}" target="_blank" class="btn-maps">${textoBotao}</a>
    `;

    containerResultados.appendChild(blocoDiv);

    new QRCode(document.getElementById(qrId), {
      text: urlQrCode,
      width: 175,
      height: 175,
      correctLevel: QRCode.CorrectLevel.L,
    });
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
