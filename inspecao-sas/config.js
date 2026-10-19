/* ======================================================================
   INSPEÇÃO SAS (PEE COPEL) — CONFIGURAÇÃO EDITÁVEL
   Tudo que pode mudar sem mexer na lógica fica aqui.
   Itens marcados com CONFIRMAR dependem de validação do Juliano.
====================================================================== */
(function(root){
  const SAS_CONFIG = {
    // Número do projeto. Entra só no registro da Tabela 1 do memorial
    // (86204POE01). No relatório e na estaca o código é só POE01.
    projectCode: '86204',

    // Código do documento no cabeçalho. CONFIRMAR se a data é de emissão do
    // modelo (fixa) ou muda por relatório. Editável em cada inspeção.
    docCode: 'SAC-RELAT.SM 22/07/26',
    rev: '00',

    defaultTechnician: 'Juliano Ciriaco da Silva Junior',
    company: 'Solar Minas LTDA',

    // Prefixo do código (3 letras, escrito também na estaca).
    // POE e COT vêm dos relatórios já emitidos; os demais foram definidos
    // em 19/10/2026 seguindo a mesma lógica (letras do nome, sem repetir).
    // Não trocar depois da ida a campo: o código da casa e da estaca mudaria.
    communities: [
      { id: 'poe',       municipio: 'Paranaguá',    nome: 'Ilha do Mel, Ponta Oeste',          moradias: 24, prefix: 'POE' },
      { id: 'pindoty',   municipio: 'Paranaguá',    nome: 'Ilha da Cotinga, Aldeia Pindoty',   moradias: 17, prefix: 'COT' }, // relatório COT01
      { id: 'tekuaty',   municipio: 'Paranaguá',    nome: 'Ilha da Cotinga, Aldeia Tekuaty',   moradias: 11, prefix: 'TEK' },
      { id: 'barra-ara', municipio: 'Guaraqueçaba', nome: 'Barra do Ararapira',                moradias: 40, prefix: 'BDA' },
      { id: 'ararapira', municipio: 'Guaraqueçaba', nome: 'Ararapira',                         moradias: 16, prefix: 'ARA' },
      { id: 'vila-fat',  municipio: 'Guaraqueçaba', nome: 'Vila Fátima',                       moradias: 18, prefix: 'VFA' },
      { id: 'abacateiro',municipio: 'Guaraqueçaba', nome: 'Abacateiro',                        moradias: 6,  prefix: 'ABA' },
      { id: 'vila-rita', municipio: 'Guaraqueçaba', nome: 'Vila Rita',                         moradias: 10, prefix: 'VRI' },
      { id: 'sibui',     municipio: 'Guaraqueçaba', nome: 'Sibuí',                             moradias: 28, prefix: 'SIB' },
      { id: 'canudal',   municipio: 'Guaraqueçaba', nome: 'Canudal',                           moradias: 13, prefix: 'CAN' },
      { id: 'barbados',  municipio: 'Guaraqueçaba', nome: 'Barbados',                          moradias: 27, prefix: 'BDS' },
      { id: 'saco-morro',municipio: 'Guaraqueçaba', nome: 'Saco do Morro',                     moradias: 8,  prefix: 'SDM' }
    ],

    photos: {
      maxSide: 1600, quality: 0.75,
      checklistMaxSide: 2200, checklistQuality: 0.8
    },

    // Central de relatórios na VPS (servidor/central). Vazio = recurso desligado.
    // Ex.: 'https://relatorios.solarminas.com.br'
    central: { url: 'https://central.169-58-19-125.sslip.io' },

    // Fotos extras (Figura 4 em diante). CONFIRMAR se continuam permitidas.
    allowExtraPhotos: true,

    texts: {
      objetivo: 'Realizar a inspeção técnica da residência para verificar as condições necessárias à instalação do Sistema de Aquecimento Solar de Água (SAS), levantando as informações técnicas que servirão de base para o planejamento e execução da instalação, conforme as características específicas de cada unidade.',
      motivo: 'A visita técnica foi realizada com a finalidade de avaliar as condições da residência para a implantação do Sistema de Aquecimento Solar de Água, verificando a infraestrutura existente, o ponto de alimentação de água fria, a existência e condição do banheiro e do chuveiro, a orientação geográfica (norte), o local previsto para instalação do sistema e demais aspectos que possam influenciar a execução dos serviços.',
      detalhe: 'Durante a inspeção foram realizados o levantamento das condições da residência e o registro fotográfico dos principais pontos de interesse. Também foi efetuada a marcação do local previsto para instalação do sistema por meio de uma estaca identificada com o código da residência, indicando o ponto onde será executada a fundação do poste de sustentação do conjunto integrado. A orientação da estaca foi utilizada como referência para o posicionamento do coletor solar em relação ao norte, garantindo a correta instalação do sistema. As informações coletadas nesta inspeção servirão como base para o planejamento executivo e para a montagem do Sistema de Aquecimento Solar de Água.',
      // Frase opcional antes do checklist e das fotos. Vazio = não imprime.
      // Preencher só com a redação exata dos modelos.
      checklistIntro: '',
      fotosIntro: '',
      // Redação do relatório COT01 (mais recente). CONFIRMAR POE01 x COT01.
      observacoesP1: 'Durante a visita técnica, foram inspecionados todos os pontos necessários para a instalação do Sistema de Aquecimento Solar (SAS), incluindo a verificação da orientação em relação ao norte, a definição do local mais adequado para instalação do reservatório térmico, priorizando sua proximidade ao banheiro, e a avaliação das condições das instalações hidráulicas existentes.',
      conclusao: 'Com base na inspeção realizada, conclui-se que as informações necessárias para o planejamento da instalação do Sistema de Aquecimento Solar de Água foram devidamente levantadas. O local de instalação foi definido e identificado em campo, permitindo o prosseguimento das etapas de execução, observadas as condições e eventuais recomendações registradas neste relatório.'
    },

    // Cartão de contato no fim do relatório: imagem inspecao-sas/cartao-contato.png
    // (1050 x 600 px). Os textos abaixo são usados só se a imagem faltar.
    contactCard: { file: 'cartao-contato.png', width: 1050, height: 600 },
    contact: {
      nome: 'Juliano Ciriaco',
      area: 'ENGENHEIRO CIVIL | CREA 389442-MG',
      email: 'orcamento@solarminas.com.br',
      celular: '(35) 9 9871-7328',
      telefone: '+55 (35) 3713-1352',
      site: 'www.solarminas.com.br'
    }
  };

  root.SAS_CONFIG = SAS_CONFIG;
  if (typeof module !== 'undefined') module.exports = SAS_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
