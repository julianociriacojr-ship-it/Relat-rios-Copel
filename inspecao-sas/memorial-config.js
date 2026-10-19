/* ======================================================================
   MEMORIAL DESCRITIVO POR COMUNIDADE — TEXTOS E DADOS EDITÁVEIS
   Transcrito do modelo "002-Memorial Descritivo SAS - Indígenas do Litoral
   do Paraná rev00" (Ponta Oeste). Marcadores entre chaves são trocados
   pelos dados da comunidade:
     {COMUNIDADE}  nome (ex.: Comunidade Ponta Oeste)
     {LOCALIZADA}  "localizada na Ilha do Mel, município de Paranaguá - PR"
     {SITUADA}     "situada na Ilha do Mel, pertencente ao município de ..."
     {QTD}         número de sistemas (moradias da comunidade)
     {TRANSPORTE}  frase sobre o transporte dos materiais
     {ACESSO}      frase sobre a região e o acesso às residências
     {ACESSO_CONCLUSAO} trecho da conclusão sobre o acesso
   Os textos de transporte e acesso são os mesmos para todas as
   comunidades (padrao abaixo); muda só o nome. {REGIAO} vira a ilha,
   quando houver, ou o nome da comunidade. Para uma comunidade com
   texto diferente, preencher transporte/acesso/acessoConclusao nela.
====================================================================== */
(function(root){
  const MEMORIAL = {
    titulo: 'MEMORIAL DESCRITIVO',
    subtitulo: 'IMPLANTAÇÃO DE SISTEMAS DE AQUECIMENTO SOLAR',
    empreendimento: 'Projeto PEE Comunidades Isoladas - Povos originários do litoral do Paraná',
    contratante: 'Companhia Paranaense de Energia (Copel)',
    empresa: 'Solar Minas LTDA',

    // Dados próprios de cada comunidade (chave = id em config.js).
    // Textos iguais para todas as comunidades (validados pelo Juliano).
    padrao: {
      transporte: 'Devido às características geográficas da {REGIAO}, o transporte dos materiais será realizado por via terrestre e hidroviária, motivo pelo qual foi adotada estrutura metálica desmontável em alumínio, reduzindo significativamente o volume transportado e facilitando a logística de montagem nas residências.',
      acesso: 'Trata-se de região litorânea inserida em área de relevante interesse ambiental, composta por residências distribuídas ao longo da comunidade e acessíveis predominantemente por embarcações e trilhas locais.',
      acessoConclusao: 'especialmente em razão do acesso predominantemente hidroviário'
    },

    // ilha: null quando a comunidade não fica em ilha.
    // transporte / acesso / acessoConclusao: só se for diferente do padrão.
    comunidades: {
      'poe':        { nome: 'Comunidade Ponta Oeste', ilha: 'Ilha do Mel', mapa: 'memorial/mapa-poe.jpg' },
      'pindoty':    { nome: 'Aldeia Pindoty', ilha: 'Ilha da Cotinga' },
      'tekuaty':    { nome: 'Aldeia Tekuaty', ilha: 'Ilha da Cotinga' },
      'barra-ara':  { nome: 'Comunidade Barra do Ararapira', ilha: null },
      'ararapira':  { nome: 'Comunidade Ararapira', ilha: null },
      'vila-fat':   { nome: 'Comunidade Vila Fátima', ilha: null },
      'abacateiro': { nome: 'Comunidade Abacateiro', ilha: null },
      'vila-rita':  { nome: 'Comunidade Vila Rita', ilha: null },
      'sibui':      { nome: 'Comunidade Sibuí', ilha: null },
      'canudal':    { nome: 'Comunidade Canudal', ilha: null },
      'barbados':   { nome: 'Comunidade Barbados', ilha: null },
      'saco-morro': { nome: 'Comunidade Saco do Morro', ilha: null }
    },

    // Imagens fixas do Projeto de Referência (iguais para todas as comunidades)
    vistas: [
      { file: 'memorial/vista-isometrica.jpg', legenda: 'Vista Isométrica do Sistema de Aquecimento Solar.' },
      { file: 'memorial/vista-frontal.jpg', legenda: 'Vista Frontal do Sistema.' },
      { file: 'memorial/vista-lateral.jpg', legenda: 'Vista Lateral do Sistema.' }
    ],

    // Seções. Cada item: string = parágrafo; { bullets: [...] } = lista.
    // 'TABELA_DISTRIBUICAO', 'FIGURA_MAPA', 'TABELA_COORDENADAS' e
    // 'FIGURAS_VISTAS' marcam onde entram as partes geradas.
    secoes: [
      { titulo: '1. IDENTIFICAÇÃO DO EMPREENDIMENTO', itens: ['IDENTIFICACAO', 'TABELA_DISTRIBUICAO'] },
      { titulo: '2. OBJETIVO', itens: [
        'O presente Memorial Descritivo tem por finalidade apresentar as características técnicas do projeto destinado à implantação de Sistemas de Aquecimento Solar (SAS) na {COMUNIDADE}, {LOCALIZADA}.',
        'O documento descreve os equipamentos previstos, os critérios técnicos adotados para instalação, os procedimentos executivos e as medidas ambientais consideradas durante a execução dos serviços, visando garantir a correta implantação dos sistemas, a preservação das características locais e a minimização dos impactos ambientais.',
        'A implantação dos sistemas proporcionará o aquecimento de água por meio da utilização de energia solar, fonte renovável e ambientalmente sustentável, contribuindo para a melhoria das condições de conforto das residências atendidas e para a redução do consumo de energia convencional.'
      ] },
      { titulo: '3. CARACTERIZAÇÃO DO EMPREENDIMENTO', itens: [
        'O empreendimento consiste na instalação de {QTD} Sistemas de Aquecimento Solar individuais destinados ao abastecimento de água quente das residências localizadas na {COMUNIDADE}.',
        'Cada sistema será instalado de forma independente, respeitando as características construtivas existentes em cada residência e utilizando, sempre que possível, a infraestrutura hidráulica existente.',
        'As instalações serão executadas por equipe técnica especializada, seguindo as normas técnicas brasileiras aplicáveis e os procedimentos estabelecidos pelo fabricante dos equipamentos.',
        '{TRANSPORTE}'
      ] },
      { titulo: '4. LOCALIZAÇÃO DO EMPREENDIMENTO', itens: [
        'O empreendimento será executado na {COMUNIDADE}, {SITUADA}.',
        '{ACESSO}',
        'A definição dos pontos de instalação foi realizada por meio de inspeções técnicas previamente executadas em todas as residências contempladas, permitindo avaliar as condições hidráulicas existentes, a incidência solar, os espaços disponíveis para instalação e a viabilidade técnica de cada unidade.',
        'FIGURA_MAPA'
      ] },
      { titulo: '4.1 COORDENADAS GEOGRÁFICAS DAS RESIDÊNCIAS', nivel: 2, itens: [
        'Com o objetivo de identificar geograficamente todas as unidades habitacionais contempladas neste memorial descritivo, apresenta-se a relação das coordenadas geográficas correspondentes a cada residência onde será implantado o Sistema de Aquecimento Solar (SAS).',
        'A identificação das residências foi realizada por meio do número de registro adotado pelo empreendimento, sendo as respectivas coordenadas apresentadas em latitude e longitude conforme a tabela a seguir.',
        'TABELA_COORDENADAS'
      ] },
      { titulo: '5. DESCRIÇÃO DO SISTEMA DE AQUECIMENTO SOLAR', itens: [
        'Cada residência será contemplada com um Sistema de Aquecimento Solar por circulação natural (termossifão), composto pelos seguintes elementos:',
        { bullets: [
          '01 Reservatório térmico com capacidade nominal de 200 litros;',
          '01 Coletor solar plano com dimensões de 2,00 x 1,00 m;',
          "01 Caixa d'água instalada sobre o reservatório térmico;",
          'Estrutura de sustentação desmontável fabricada em alumínio;',
          'Tubulações hidráulicas e conexões necessárias para alimentação e distribuição de água;',
          'Elementos de fixação e acessórios para montagem do conjunto.'
        ] },
        'O sistema utilizará exclusivamente a energia proveniente da radiação solar para o aquecimento da água, dispensando equipamentos de circulação forçada, reduzindo o consumo de energia elétrica e simplificando sua operação e manutenção.',
        "A alimentação hidráulica ocorrerá por gravidade, utilizando a caixa d'água posicionada sobre o reservatório térmico, garantindo abastecimento contínuo conforme as condições hidráulicas existentes em cada residência."
      ] },
      { titulo: '6. PROJETO DE REFERÊNCIA', itens: [
        'As residências da {COMUNIDADE} apresentam diferentes características arquitetônicas, estruturais e hidráulicas, impossibilitando a elaboração de um projeto executivo individual para cada unidade.',
        'Dessa forma, foi desenvolvido um Projeto de Referência em modelo tridimensional (3D), representando a configuração padrão adotada para implantação do Sistema de Aquecimento Solar.',
        'O modelo tridimensional apresenta a disposição dos componentes do sistema, servindo como referência técnica para execução das instalações e padronização dos procedimentos de montagem.',
        'As adaptações necessárias em cada residência serão realizadas durante a execução da obra, considerando as características específicas de cada imóvel, sem alterar os princípios de funcionamento, segurança e desempenho do sistema.',
        'A configuração padrão contempla:',
        { bullets: [
          'reservatório térmico de 200 litros;',
          'coletor solar plano de 2,00 x 1,00 m;',
          "caixa d'água instalada sobre o reservatório;",
          'estrutura desmontável em alumínio;',
          'interligações hidráulicas entre os componentes.'
        ] },
        'A estrutura metálica foi desenvolvida em alumínio devido às suas características de elevada resistência à corrosão, especialmente em ambientes litorâneos sujeitos à ação da maresia, além de proporcionar menor peso próprio, facilidade de transporte, rapidez na montagem e maior vida útil quando comparada às estruturas convencionais em aço carbono.',
        'FIGURAS_VISTAS'
      ] },
      { titulo: '7. MÉTODO EXECUTIVO', itens: [
        'A implantação dos sistemas será realizada conforme a sequência executiva descrita a seguir:',
        { bullets: [
          'Mobilização da equipe técnica e dos equipamentos;',
          'Transporte dos materiais até a comunidade;',
          'Conferência dos equipamentos e componentes;',
          'Definição do ponto de instalação conforme levantamento técnico realizado;',
          'Perfuração do solo;',
          'Montagem da estrutura de sustentação em alumínio;',
          'Instalação do reservatório térmico;',
          'Instalação do coletor solar;',
          "Instalação da caixa d'água superior;",
          'Execução das interligações hidráulicas;',
          'Realização dos testes de estanqueidade e funcionamento;',
          'Limpeza da área de trabalho e entrega do sistema ao usuário.'
        ] }
      ] },
      { titulo: '8. CRITÉRIOS TÉCNICOS DE IMPLANTAÇÃO', itens: [
        'A implantação dos Sistemas de Aquecimento Solar na {COMUNIDADE} foi precedida por levantamento técnico individual das residências contempladas, com o objetivo de verificar as condições necessárias para instalação segura e eficiente dos equipamentos.',
        'Durante as inspeções técnicas foram avaliados os seguintes aspectos:',
        { bullets: [
          'Localização da residência e condições de acesso;',
          'Disponibilidade e condições da infraestrutura hidráulica existente;',
          "Posição da caixa d'água e ponto de alimentação do sistema;",
          'Definição da melhor orientação do coletor solar em relação ao norte geográfico, buscando maximizar o aproveitamento da radiação solar incidente;',
          'Verificação de elementos que possam ocasionar sombreamento parcial ou total do coletor solar;',
          'Proximidade entre o sistema e os pontos de consumo de água quente, reduzindo perdas térmicas na tubulação;',
          'Estabilidade e condições do terreno para instalação da estrutura de sustentação.'
        ] },
        'As adaptações necessárias em cada residência serão realizadas exclusivamente para compatibilização da instalação com as características locais, mantendo-se inalteradas as especificações técnicas e o princípio de funcionamento do sistema.'
      ] },
      { titulo: '9. ASPECTOS AMBIENTAIS', itens: [
        'O empreendimento caracteriza-se como uma intervenção de baixo impacto ambiental, tendo em vista que consiste na instalação de equipamentos destinados ao aproveitamento de fonte renovável de energia, sem alteração significativa das características naturais da área.',
        'As atividades previstas restringem-se à montagem das estruturas de sustentação e às interligações hidráulicas necessárias ao funcionamento do sistema, não sendo previstas intervenções de grande porte ou modificações permanentes no terreno.',
        'Durante a execução dos serviços serão observadas as seguintes diretrizes ambientais:',
        { bullets: [
          'Preservação da vegetação existente, evitando intervenções desnecessárias;',
          'Utilização preferencial de áreas já ocupadas pelas residências;',
          'Manutenção das condições naturais de drenagem superficial;',
          "Não intervenção em cursos d'água, nascentes ou áreas úmidas;",
          'Execução das atividades exclusivamente nas áreas destinadas à instalação dos equipamentos;',
          'Utilização de equipamentos e ferramentas em boas condições de funcionamento, prevenindo vazamentos de óleo ou combustíveis;',
          'Organização permanente da frente de trabalho, evitando a dispersão de materiais no entorno das residências.'
        ] },
        'Em função das características do empreendimento, não são previstos impactos ambientais permanentes decorrentes da implantação dos sistemas.'
      ] },
      { titulo: '10. GESTÃO DOS RESÍDUOS', itens: [
        'Os resíduos gerados durante a execução das instalações serão provenientes, principalmente, de embalagens dos equipamentos, recortes de tubulações, conexões, elementos de fixação e materiais auxiliares utilizados durante a montagem.',
        'Todos os resíduos serão segregados conforme sua natureza e acondicionados temporariamente em recipientes apropriados, permanecendo armazenados em local adequado até sua retirada da comunidade.',
        'Os resíduos recicláveis, tais como papelão, plástico e metais, serão destinados, sempre que possível, a empresas ou unidades devidamente licenciadas para reciclagem.',
        'Os resíduos não recicláveis serão recolhidos pela equipe responsável pela instalação e transportados ao continente, onde receberão destinação final ambientalmente adequada, em conformidade com a legislação ambiental vigente e com os procedimentos internos adotados pela contratada, sendo expressamente proibido o descarte em solo, corpos hídricos, áreas de vegetação ou qualquer outro local inadequado.',
        'Ao término de cada instalação, será realizada a limpeza completa da área de trabalho, removendo todos os resíduos e materiais remanescentes, de forma a restabelecer as condições originais do local antes do início dos serviços.'
      ] },
      { titulo: '11. SEGURANÇA DO TRABALHO', itens: [
        'Todas as atividades serão executadas observando os requisitos de segurança estabelecidos pelas Normas Regulamentadoras do Ministério do Trabalho e Emprego, bem como os procedimentos internos da empresa executora.',
        'Os colaboradores utilizarão Equipamentos de Proteção Individual (EPIs) compatíveis com as atividades desenvolvidas, incluindo, quando aplicável:',
        { bullets: [
          'Capacete de segurança;',
          'Óculos de proteção;',
          'Luvas de proteção;',
          'Calçado de segurança;',
          'Perneira (Proteção das pernas);',
          'Cinturão de segurança para trabalho em altura;',
          'Demais equipamentos específicos conforme análise de risco.'
        ] },
        'As áreas de trabalho serão mantidas organizadas durante toda a execução dos serviços, reduzindo riscos de acidentes e garantindo a segurança dos trabalhadores e dos moradores da comunidade.'
      ] },
      { titulo: '12. BENEFÍCIOS AMBIENTAIS', itens: [
        'A implantação dos Sistemas de Aquecimento Solar representa uma alternativa sustentável para o aquecimento de água nas residências da {COMUNIDADE}, proporcionando benefícios ambientais e sociais de longo prazo.',
        'Entre os principais benefícios destacam-se:',
        { bullets: [
          'Aproveitamento da energia solar como fonte renovável e limpa;',
          'Redução do consumo de energia elétrica destinada ao aquecimento de água;',
          'Diminuição indireta das emissões de gases de efeito estufa associadas à geração de energia;',
          'Incentivo ao uso racional dos recursos energéticos;',
          'Aumento da eficiência energética das residências;',
          'Melhoria das condições de conforto e qualidade de vida dos moradores;',
          'Utilização de equipamentos de elevada durabilidade e baixa necessidade de manutenção.'
        ] },
        'A adoção de sistemas de aquecimento solar contribui para a promoção de práticas sustentáveis, alinhadas aos princípios de conservação ambiental e desenvolvimento sustentável.'
      ] },
      { titulo: '13. NORMAS TÉCNICAS APLICÁVEIS', itens: [
        'A implantação dos Sistemas de Aquecimento Solar observará as normas técnicas brasileiras pertinentes, destacando-se:',
        { bullets: [
          'ABNT NBR 15569 - Sistema de Aquecimento Solar de Água em Circuito Direto - Projeto e Instalação;',
          'ABNT NBR 5626 - Sistemas Prediais de Água Fria;',
          'ABNT NBR 7198 - Projeto e Execução de Instalações Prediais de Água Quente;',
          'ABNT NBR ISO 9001 (quando aplicável aos processos de fabricação dos equipamentos);',
          'Normas Regulamentadoras do Ministério do Trabalho e Emprego, em especial NR-06 (Equipamentos de Proteção Individual), NR-18 (Condições e Meio Ambiente de Trabalho na Indústria da Construção) e NR-35 (Trabalho em Altura), quando aplicáveis.'
        ] },
        'Os equipamentos utilizados deverão atender às especificações técnicas do fabricante e às normas vigentes, garantindo segurança, desempenho e durabilidade.'
      ] },
      { titulo: '14. CONCLUSÃO', itens: [
        'A implantação de {QTD} Sistemas de Aquecimento Solar na {COMUNIDADE}, {LOCALIZADA}, constitui uma solução tecnicamente adequada e ambientalmente sustentável para o fornecimento de água aquecida às residências contempladas.',
        'As intervenções previstas apresentam baixo potencial de impacto ambiental, uma vez que se restringem à instalação de equipamentos em áreas já ocupadas, sem necessidade de movimentação significativa de solo, supressão de vegetação ou alteração das condições naturais do terreno.',
        'A utilização de estruturas desmontáveis em alumínio contribui para a redução dos impactos logísticos, facilitando o transporte até a comunidade, {ACESSO_CONCLUSAO}, além de proporcionar elevada resistência à corrosão provocada pela atmosfera marinha e maior vida útil ao conjunto instalado.',
        'As instalações serão executadas conforme as boas práticas de engenharia, observando as normas técnicas aplicáveis, a legislação ambiental vigente e os critérios estabelecidos neste memorial descritivo, garantindo a qualidade da execução, a segurança dos usuários e a confiabilidade operacional dos sistemas.',
        'Dessa forma, conclui-se que o empreendimento apresenta viabilidade técnica e ambiental para sua implantação, promovendo o uso de energia renovável, a melhoria das condições de conforto das famílias beneficiadas e o incentivo ao desenvolvimento sustentável da {COMUNIDADE}.'
      ] }
    ]
  };

  root.SAS_MEMORIAL_CONFIG = MEMORIAL;
  if (typeof module !== 'undefined') module.exports = MEMORIAL;
})(typeof window !== 'undefined' ? window : globalThis);
