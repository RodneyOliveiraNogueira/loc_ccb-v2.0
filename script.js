const SHEET_ID = "1QDUCLr8tZzTbxc1dwSf0Pl-0U7MjGyu7IzCgq95za1o";
const NOME_ABA = "Cadastro";
const URL_WEBHOOK =
  "https://script.google.com/macros/s/AKfycbwwYNic6HrlhNeps58h2MERfJZ-DOcfXm2wbfPWRoAP1wKvWsrYVCbqf_kcuduSjzNw/exec";

let COORD_PORTARIA = { lat: -22.816945097334372, lng: -42.088560977464915 };

let baseEnderecos = [];
let baseAreasComuns = [];
let historicoAcessosCache = [];
let filaEntregas = [];
let mapaLeaflet = null;
let camadaMarcadores = null;

let modoViagemSelecionado = "";
let perfilSelecionado = "";
let cnhSelecionada = "";
let deslocamentoConfirmado = false;

window.onload = async () => {
  configurarVisibilidadeDispositivo();
  if (!ehDispositivoMovel()) {
    await carregarUltimosAcessos();
  }
  await carregarPlanilha();
  configurarBotaoPortaria();
  inicializarMapaPC();
  carregarFilaLocal();
  carregarDadosSalvosCelular();
  atualizarEstadoBotoesAcao();

  if (!ehDispositivoMovel()) {
    setInterval(carregarUltimosAcessos, 20000);
  }
};

function ehDispositivoMovel() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function configurarVisibilidadeDispositivo() {
  const ehCelular = ehDispositivoMovel();
  const btnPortaria = document.getElementById("btn-rota-portaria");
  const btnContatoFora = document.querySelector(".btn-contato-portaria-fora");
  const painelUltimos = document.getElementById("painel-ultimos-acessos");

  if (btnPortaria) btnPortaria.style.display = ehCelular ? "block" : "none";
  if (btnContatoFora)
    btnContatoFora.style.display = ehCelular ? "flex" : "none";
  if (painelUltimos) painelUltimos.style.display = ehCelular ? "none" : "block";

  // Nota: A exibição do box-cnh-pc no PC agora é controlada diretamente ao clicar em Carro, Moto ou A pé na função selecionarModo().
}

function selecionarModo(modo) {
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
  const boxCnhPc = document.getElementById("box-cnh-pc"); // Bloco do documento
  const labelDoc = document.getElementById("label-documento");

  dadosExtra.style.display = "flex";

  // Se for no PC, exibe o bloco de documento para qualquer modo (Carro, Moto ou A pé)
  if (!ehDispositivoMovel() && boxCnhPc) {
    boxCnhPc.style.display = "flex";
  }

  if (modo === "driving" || modo === "two-wheeler") {
    boxPlaca.style.display = "flex";
    if (labelDoc) labelDoc.textContent = "PORTA CNH?";
    carregarDadosSalvosCelular();
  } else {
    boxPlaca.style.display = "none";
    if (inputPlaca) inputPlaca.value = "";
    if (labelDoc) labelDoc.textContent = "PORTA ID?"; // Exibe Porta ID quando for a pé
  }

  configurarBotaoPortaria();

  if (ehDispositivoMovel()) {
    const placaSalva = localStorage.getItem("loc_ccb_ultima_placa") || "";
    const nomeSalvo = localStorage.getItem("loc_ccb_nome") || "";
    const perfilSalvo = localStorage.getItem("loc_ccb_perfil") || "";

    const exigePlaca = modo === "driving" || modo === "two-wheeler";
    const placaValida =
      !exigePlaca ||
      /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(
        placaSalva.replace(/[^A-Z0-9]/g, ""),
      );

    if (placaValida && nomeSalvo && perfilSalvo) {
      if (exigePlaca && inputPlaca) inputPlaca.value = placaSalva;
      document.getElementById("nome-visitante").value = nomeSalvo;
      selecionarPerfil(perfilSalvo);
      confirmarDeslocamento();
    }
  }
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

  if (placaDigitada.length >= 7 && historicoAcessosCache.length > 0) {
    const placaLimpaBusca = placaDigitada.replace(/[^A-Z0-9]/g, "");
    const registroRecorrente = historicoAcessosCache.find(
      (item) => item.placa.replace(/[^A-Z0-9]/g, "") === placaLimpaBusca,
    );

    if (registroRecorrente) {
      document.getElementById("nome-visitante").value = registroRecorrente.nome;
      if (registroRecorrente.perfil) {
        selecionarPerfil(registroRecorrente.perfil);
      }
      if (!ehDispositivoMovel() && registroRecorrente.cnh) {
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

function carregarDadosSalvosCelular() {
  if (!ehDispositivoMovel()) return;

  const inputPlaca = document.getElementById("placa");
  const inputNome = document.getElementById("nome-visitante");

  const ultimaPlaca = localStorage.getItem("loc_ccb_ultima_placa");
  const ultimoNome = localStorage.getItem("loc_ccb_nome");
  const ultimoPerfil = localStorage.getItem("loc_ccb_perfil");

  if (ultimaPlaca && inputPlaca && !inputPlaca.value)
    inputPlaca.value = ultimaPlaca;
  if (ultimoNome && inputNome && !inputNome.value) inputNome.value = ultimoNome;
  if (ultimoPerfil && !perfilSelecionado) selecionarPerfil(ultimoPerfil);
}

function validarDeslocamento() {
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
    if (ehDispositivoMovel()) {
      localStorage.setItem("loc_ccb_ultima_placa", placaLimpa);
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
    mostrarErro("Selecione o Perfil (Visitante, Entregador ou Prestador).");
    return false;
  }

  if (
    !ehDispositivoMovel() &&
    !cnhSelecionada &&
    modoViagemSelecionado !== "walking"
  ) {
    mostrarErro("Informe se o condutor porta CNH (Sim ou Não).");
    return false;
  }

  if (ehDispositivoMovel()) {
    localStorage.setItem("loc_ccb_nome", nomeLimpo);
    localStorage.setItem("loc_ccb_perfil", perfilSelecionado);
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

    baseAreasComuns = dados.table.rows
      .map((linha) => {
        if (linha.c.length <= 10) return null;

        const tipoArea = obterValorCelula(linha.c[7]);
        const nomeArea = obterValorCelula(linha.c[8]);
        const ladoArea = obterValorCelula(linha.c[9]);
        const coordenadaArea = obterValorCelula(linha.c[10]);

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

  if (!ehDispositivoMovel()) {
    document.getElementById("painel-mapa").style.display = "flex";
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
  const cnh = ehDispositivoMovel()
    ? "N/A (Celular)"
    : modoViagemSelecionado === "walking" && !cnhSelecionada
      ? "N/A"
      : `${docTipo}: ${cnhSelecionada}`;

  fetch(URL_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
      aparelho: tipoAparelho,
      nome,
      perfil: perfilSelecionado,
      cnh,
      transporte,
      placa,
      fila: lista,
    }),
  }).then(() => {
    if (!ehDispositivoMovel()) {
      setTimeout(carregarUltimosAcessos, 2000);
    }
  });
}

async function carregarUltimosAcessos() {
  if (ehDispositivoMovel()) return;
  const ul = document.getElementById("lista-ultimos-acessos");
  if (!ul) return;

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent("Histórico")}`;

  try {
    const resp = await fetch(url);
    const txt = await resp.text();
    const jsonStr = txt.substring(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
    const dados = JSON.parse(jsonStr);

    const agora = new Date();
    const limiteUmaHora = 60 * 60 * 1000;
    const linhasRecentes = [];
    historicoAcessosCache = [];

    dados.table.rows.forEach((r) => {
      if (!r.c || !r.c[0]) return;
      const strData = obterValorCelula(r.c[0]);
      const dataReg = parseDataPlanilha(r.c[0], strData);

      const totalCols = r.c.length;
      let nome = "Visitante";
      let perfil = "";
      let cnh = "";
      let transporte = "";
      let placa = "";
      let enderecos = "";

      if (totalCols >= 8) {
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

      if (placa && !placa.includes("Sem placa")) {
        const placaLimpa = placa.replace(/[^A-Z0-9]/g, "");
        const idx = historicoAcessosCache.findIndex(
          (item) => item.placa.replace(/[^A-Z0-9]/g, "") === placaLimpa,
        );
        if (idx === -1) {
          historicoAcessosCache.push({ nome, perfil, cnh, placa });
        }
      }

      if (
        dataReg &&
        agora - dataReg <= limiteUmaHora &&
        agora - dataReg >= -60000
      ) {
        linhasRecentes.push({
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

    linhasRecentes.reverse();
    ul.innerHTML = "";

    if (linhasRecentes.length === 0) {
      ul.innerHTML = `<li class="item-vazio">Nenhum acesso registrado na última hora.</li>`;
      return;
    }

    linhasRecentes.forEach((item) => {
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
    atualizarInterfaceFila();
  }
}

function limparSelecaoCompleta() {
  const ehCelular = ehDispositivoMovel();

  if (!ehCelular) {
    document.getElementById("placa").value = "";
    document.getElementById("nome-visitante").value = "";
    perfilSelecionado = "";
    cnhSelecionada = "";
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
}

function mostrarErro(msg) {
  const divErro = document.getElementById("erro");
  divErro.textContent = msg;
  divErro.style.display = "block";
}

function esconderErro() {
  document.getElementById("erro").style.display = "none";
}
