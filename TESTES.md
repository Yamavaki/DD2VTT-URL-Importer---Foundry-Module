# DD2VTT URL Importer 1.9.4 + mod "Exportar para Foundry (Nauren)" 1.0.5 — testes

Ciclo atual: andares (visão entre andares, andares de cima em fade, iluminação global), escadas e elevadores. Marque o que passou e mande o erro do console (F12) do que falhar.

## 1.9.4 — token subia a escada e continuava com 0 m

- [ ] Abra a cena: tokens que ficaram presos com a elevação errada (aparecendo "-3 m" no Andar 1) vão sozinhos para 0 m do andar (o mestre precisa estar conectado).
- [ ] Suba a escada: o token chega no Andar 1 com **0 m** (elevação 3 de verdade) e fica **por cima** da imagem do Andar 1.
- [ ] Desça a escada: volta para o Térreo com 0 m.
- [ ] Vendo o Térreo, o Andar 1 continua sumindo quando um token seu do Térreo passa embaixo (e não por causa de um token que já está no Andar 1).

## 1.9.3 — portas do andar de cima aparecendo no de baixo

- [ ] Vendo o **Térreo**, as portas do Andar 1 só aparecem junto com a imagem do Andar 1, e somem (fade) junto com ela quando o token passa embaixo ou o mouse passa por cima.
- [ ] Vendo o Térreo, o **ícone** de abrir/fechar das portas do Andar 1 não aparece (ninguém abre a porta de cima estando embaixo). Vendo o Andar 1, o ícone volta.
- [ ] As portas e ícones do próprio Térreo continuam normais.
- [ ] Tiles que estão só no Andar 1 também somem junto com ele.

## 1.9.2 — de volta ao jeito antigo (imagem no próprio andar) + fade feito pelo módulo

Desfeito o tile da 1.9.1: cada andar volta a usar a própria imagem (a prévia da cena volta). O fade agora é o módulo que faz na tela: vendo um andar de baixo, a imagem do andar de cima fica transparente quando um token seu passa embaixo ou quando o mouse passa por cima dela.

- [ ] Abra **Andares** na cena estragada pela 1.9.1: deve aparecer "Andares arrumados..." e as duas imagens voltam (e o tile extra some). Se a prévia da cena não voltar, importe de novo.
- [ ] Importar os 2 andares: aparecem as **duas artes** e a cena tem **prévia** na lista de cenas.
- [ ] Vendo o **Térreo**, com um token **selecionado** embaixo do mezanino: o Andar 1 some (fade) e você vê o token. Saindo de baixo, ele volta.
- [ ] Token em cima do **vão** (onde o Andar 1 é transparente): o Andar 1 **não** some.
- [ ] Sem token selecionado, passar o **mouse** por cima do Andar 1: ele some; tirando o mouse, volta.
- [ ] Como **jogador**: os tokens dele fazem o Andar 1 sumir mesmo sem selecionar.
- [ ] Vendo o **Andar 1**: nada some.
- [ ] Configurações do módulo: **"Andar de cima: quando ele some"** (token e mouse / só token / só mouse / nunca) e **"quanto fica visível quando some"** (0 = some de vez; 0,3 = vulto). Valem só para quem mudou.
- [ ] Se não sumir: no console (F12) rode `game.modules.get("dd2vtt-url-importer").api.fadeDebug()` e mande a tabela que aparece.

## 1.9.0 — visão entre andares, fade e iluminação global

Importe uma cena de 2 andares (ex.: a taverna navio: térreo + andar de cima com o vão no meio).

**No importador**
- [ ] Com 2+ andares, a seção Andares mostra **"Andares de cima veem os de baixo"** e **"Andares de baixo veem os de cima, em fade"**, os dois ligados.
- [ ] Cada cartão de andar mostra **"Este andar vê: os de baixo / os de cima (fade)"**. Mudar o botão geral muda todos os cartões.
- [ ] Na seção Luzes aparece **"Iluminação global"** (desligada). Ligada, a cena entra com a iluminação global ligada (Configurar cena → Iluminação).
- [ ] A mensagem final diz "N andar(es) de cima em fade".

**No Foundry (o principal)**
- [ ] Vendo o **andar de cima**, dá para ver o térreo por baixo (pelo vão, sacadas, fora da construção).
- [ ] Vendo o **térreo**, o andar de cima aparece **por cima** (camada de Tiles: um tile travado com a imagem do andar de cima, só no andar de baixo).
- [ ] Um token no térreo que entra **embaixo** do andar de cima faz o andar de cima **sumir (fade)** e mostra a visão dele lá embaixo. Saindo, o andar de cima volta.
- [ ] Passar o mouse por cima também deixa o andar de cima transparente (fade ao passar o mouse do próprio Foundry) — anote se acontece.
- [ ] Token no andar de cima **vê** o token do térreo (e o contrário), para atirar entre andares. Anote se a parede/chão bloqueia como esperado.
- [ ] **Importante:** a imagem do andar de cima precisa ter **fundo transparente** fora da construção. Se ela vier opaca, o andar de cima cobre o térreo inteiro: anote, porque aí o próximo passo é a máscara do mod ("Jeito 1").
- [ ] Anote se o Foundry desenha o andar de cima **duas vezes** (o próprio andar + o tile em fade) ou se ele fica por cima sem fazer fade: nesse caso eu troco para usar só o tile.

**No gerenciador "Andares"**
- [ ] No topo: **Iluminação global** (liga/desliga na hora) e os botões **Todos veem todos**, **Só para baixo** e **Nenhum**.
- [ ] Cada andar tem a linha **"Vê"** com um botão para cada outro andar (seta para cima = andar de cima em fade; para baixo = andar de baixo). Marcar/desmarcar cria/apaga o tile de fade na hora.
- [ ] Trocar a **URL da imagem** de um andar troca a imagem dos tiles de fade dele.
- [ ] Mudar o **teto** de um andar muda a altura dos tiles de fade que ficam nele.
- [ ] A contagem "N tiles" do andar **não** conta os tiles de fade.
- [ ] **Apagar andar** apaga os tiles de fade dele (e os que mostravam ele), sem mandar esses tiles para outro andar.
- [ ] **Novo andar** tem "Vê os de baixo", "Vê os de cima (em fade)" e "Os outros andares veem este" (os três marcados).

## 1.8.2 — editor de escada

- [ ] Ao clicar para desenhar/editar uma escada, o mapa continua visível (antes a tela inteira ficava roxa).

## 1.8.1 — imagem pelo Google Drive ou pela Forge

- [ ] Cole o link de compartilhamento do Drive (arquivo em "Qualquer pessoa com o link"). A miniatura deve aparecer com o tamanho em px.
- [ ] Se a miniatura não aparecer, a mensagem deve explicar o motivo (compartilhamento ou imagem grande).
- [ ] Se o Drive entregar a imagem reduzida, deve aparecer um aviso amarelo dizendo que o mapa pode ficar borrado.
- [ ] O botão de pasta ao lado da URL abre a Biblioteca de Assets da Forge. Envie a imagem, escolha e veja se a URL é preenchida e a miniatura aparece.
- [ ] Importe usando a imagem escolhida pelo botão de pasta.

## Preparação
- [ ] Suba as pastas de folhas de **porta** (`Door_*_1x1.png`) e de **janela** (`Window_*_1x1.png`) para a Forge (ou deixe no `Data` do PC).
- [ ] Configurações do módulo: em **Pasta das artes de porta** e **Pasta das artes de janela**, o botão de pasta abre o navegador do Foundry e deixa escolher a pasta da Forge.
- [ ] As outras configurações aparecem: **Variantes de janela que abrem** (A, B) e **Porta dupla a partir de** (1,6).

## Galeria de artes (no importador)
- [ ] Na seção Portas e janelas aparecem os cartões **Portas** e **Janelas** com uma arte já escolhida (madeira nogueira, se existir).
- [ ] **Trocar** abre a galeria com as miniaturas de todas as artes da pasta.
- [ ] Filtros funcionam: Madeira / Pedra / Metal, cor, com/sem ferrugem e busca.
- [ ] Clicar escolhe (borda dourada + prévia simples e dupla à direita); duplo clique ou **Usar esta arte** confirma.
- [ ] Teclado: Tab chega na grade, setas andam, Enter escolhe, Enter de novo confirma.
- [ ] Na galeria de janelas aparecem só as que abrem (A e B); desmarcando **Só janelas que abrem** aparecem as fixas, com aviso.
- [ ] **Trocar pasta** e **Recarregar** funcionam; sem pasta configurada aparece o botão **Escolher pasta**.
- [ ] O **×** do cartão deixa as portas sem arte (portas comuns).

## Importação do mapa de teste (`Teste_Portas_e_Janelas.dd2vtt`)
- [ ] Resumo do arquivo: 10×10, 9 portas, 2 janelas, 1 luz.
- [ ] Mensagem final: 9 encaixadas na moldura, 5 duplas.
- [ ] As **folhas de porta ficam entre os postes** da moldura, sem cobrir os postes.
- [ ] Os **postes viram parede**: token não atravessa o poste e a visão não vaza por ali.
- [ ] Portas de 1 quadrado são simples; as de 2 quadrados são **duplas** e abrem do centro, cada folha para um lado.
- [ ] Clicar no ícone abre e fecha com animação e **som de madeira/pedra/metal** conforme a arte (Som: Automático).
- [ ] **Janelas — jogadores podem abrir** (padrão): jogador vê o ícone e abre e fecha com animação; fechada dá para ver através e a luz passa, mas o token não passa.
- [ ] Janelas entram **fechadas** por padrão e, mesmo fechadas, deixam ver e a luz passa.
- [ ] Janelas têm **som** ao abrir/fechar: Som "Automático pelo material" já vem marcado (madeira → som de madeira, metal → som de metal), mesmo que antes estivesse "Sem som".
- [ ] Dá para trocar o som das janelas na importação e na ferramenta de estilo (aba Janelas → Som).
- [ ] Ligando **Começar abertas**, as janelas entram abertas (as portas continuam fechadas).
- [ ] **Janelas — só o mestre abre**: jogador não vê ícone; só o mestre abre e fecha.
- [ ] **Janelas — estática**: sem arte, sem ícone, deixa ver e bloqueia passagem (como na 1.3).
- [ ] **Abrir para: Fora** (padrão, em portas e em janelas): portas e janelas da parede externa abrem **para fora** da casa. Mensagem final: "11 virada(s) para abrir para fora".
- [ ] **Abrir para: Dentro** faz o contrário; **Como veio** deixa como o Dungeondraft exportou.
- [ ] Porta entre dois cômodos fica como veio (não tem "fora").
- [ ] **Sem vão no meio** (ligado por padrão): a janela dupla fecha certinho no centro, sem espaço entre as folhas.
- [ ] Desligando **Sem vão no meio**, volta o espacinho no centro (para batentes com montante no meio).
- [ ] **Variar arte** ligado: as portas recebem variantes diferentes da mesma cor.
- [ ] **Encaixar na moldura** desligado: as portas voltam a ocupar o portal inteiro.
- [ ] A próxima importação já abre com as mesmas escolhas da anterior.

## Ferramenta "Estilo de portas e janelas"
- [ ] Na aba **Cenas**, ao lado de "Importar Dungeondraft", aparece o botão **Estilo de portas** e ele abre a ferramenta.
- [ ] Clique duplo numa porta/janela (camada de Paredes) → na configuração aparece **Estilo da porta (galeria de artes)** no topo; ele abre a ferramenta já com aquela porta selecionada.
- [ ] Na barra da camada de **Paredes** aparece o botão com ícone de porta aberta (só para o mestre).
- [ ] Ele abre a janela com a galeria à esquerda e as opções à direita.
- [ ] Selecionando 2 portas no mapa, o contador de **Portas selecionadas** mostra 2; sem seleção, marca **Todas as portas da cena**.
- [ ] Escolher outra arte e **Aplicar** troca a arte das portas na hora.
- [ ] **Manter a arte atual** muda só animação/som/simples-dupla, sem trocar a arte.
- [ ] **Simples / Dupla** troca o modo da porta.
- [ ] **Estado: Abertas / Fechadas** abre ou fecha de uma vez as portas ou janelas escolhidas.
- [ ] **Abrir para: Fora / Dentro** vira as portas/janelas escolhidas para o lado certo.
- [ ] Ajustes rápidos nas selecionadas: **Abrir para o outro lado**, **Trocar dobradiça** e **Espelhar arte** mudam na hora.
- [ ] Aba Janelas: **Vão no meio: Sem vão / Com vão** muda as janelas duplas escolhidas.
- [ ] Aba **Janelas**: aplica arte de janela e **Quem abre** (Jogadores / Só o mestre).
- [ ] **Atualizar caminhos**: depois de mover a pasta das artes e trocar a configuração, as portas da cena voltam a mostrar a arte.

## Luzes
- [ ] Importador: **Alcance extra da luz fraca** = 3 → uma luz de alcance 6 no Dungeondraft vira **9 / 4,5 m**.
- [ ] Aba **Cenas** → botão **Luzes da cena** abre a ferramenta (também na barra da camada de Iluminação e por macro `game.modules.get("dd2vtt-url-importer").api.lights()`).
- [ ] A ferramenta lista os **tamanhos encontrados** (ex.: "10 / 5 m — 4 luzes") com barrinhas.
- [ ] **Todas da cena** / **Só as selecionadas** (selecione luzes na camada de Iluminação) muda a lista e o contador.
- [ ] Desmarcar um tamanho deixa essas luzes de fora.
- [ ] **Ajuste rápido** (+1, +2, +5, −1, −2 m) muda as luzes na hora; a luz forte acompanha na mesma proporção.
- [ ] **Desfazer** volta ao que era antes (pode desfazer várias vezes).
- [ ] **Ajuste fino**: Somar metros / Multiplicar / Definir valor, com prévia "antes → depois" antes de aplicar.
- [ ] Desligando **Luz forte acompanha a fraca**, dá para escolher a luz forte separada (ela nunca passa da fraca).

## Janelas do módulo (visual)
- [ ] **Estilo de portas e janelas**: nada sai para fora da janela; **Aplicar** e **Atualizar caminhos** ficam embaixo, um sobre o outro, dentro da coluna da direita.
- [ ] A coluna da direita rola quando não cabe, e o botão **Aplicar** fica sempre visível.
- [ ] Bolinhas de opção (rádios) e caixinhas aparecem claras: marcada fica dourada (rádio) ou roxa com ✓ (caixinha).
- [ ] A barra de **Duração** mostra trilho roxo e marcador dourado.
- [ ] Diminuindo a largura das janelas (importador, galeria, estilo, luzes), os botões quebram linha em vez de vazar.
- [ ] Ao abrir a galeria, ela rola até a arte que já está escolhida.

## Mod do Dungeondraft (ver LEIA-ME.md do mod)
- [ ] O mod aparece na lista de mods e ativa junto com Soft Shadows, Unofficial Patch, Better Terrain, Layers Panel, Asset Inspector e ColourAndModifyThings, sem erro no log.
- [ ] Na janela de exportação aparecem os formatos **Foundry Nauren (WebP) / (PNG) / (JPEG)**.
- [ ] A janela de exportação fica inteira (nada para fora à direita) e dá para clicar em **Exportar todos os andares** e nos botões ON/OFF de Iluminação.
- [ ] Escolhendo um deles aparece a caixa **Foundry (Nauren)**; escolhendo PNG/JPEG/WebP/Universal VTT normais, ela some.
- [ ] Exportar um andar gera **dois arquivos**: `.dd2vtt` (pequeno, sem imagem) + a imagem no formato escolhido, com o mesmo nome.
- [ ] O aviso no fim mostra os arquivos e "Portas com moldura identificada: X de Y".
- [ ] Mapa com vários andares: o nome dos arquivos ganha `_1_NomeDoAndar`.
- [ ] **Exportar todos os andares de uma vez** + um clique em Exportar: todos os andares saem sozinhos (a caixa mostra "X de Y prontos"); no fim aparece a lista de arquivos.
- [ ] **Cancelar a sequência de andares** interrompe e mostra o que já foi exportado.
- [ ] Sombras do Soft Shadows e grade/luz do Unofficial Patch saem iguais à exportação normal em todos os andares.
- [ ] Com "Export Trace Image" do Unofficial Patch ligado, exportar não trava (no log: aviso de paredes de objetos não exportadas).

- [ ] Parede com **Allow Light** (Unofficial Patch): o aviso do fim mostra "Paredes com Allow Light: N" (N > 0).

## Importador com arquivos do mod
- [ ] Dois andares do mod 1.0.4: o **térreo** vira o 1º cartão (chip "andar 1 de 2 (térreo)") e fica na elevação 0; os arquivos saem `_1_Ground`, `_2_Andar_2`.
- [ ] Ao colar a URL aparece a **miniatura** da imagem no cartão: confira que é a imagem daquele andar.
- [ ] **Inverter ordem** troca qual cartão é o térreo.
- [ ] Cada porta fica no andar certo (a porta do térreo não aparece no de cima e vice-versa).
- [ ] Andar com todas as paredes marcadas Allow Light: aviso "todas as paredes vieram com Allow Light" e as paredes bloqueiam luz normalmente.
- [ ] Arquivo com parede Allow Light mostra o chip "N paredes com Allow Light".
- [ ] **Luzes → Paredes com "Allow Light" = Luz e visão passam** (padrão): na varanda a luz e a visão atravessam a parede, mas o token não passa.
- [ ] **Só a luz passa**: a luz atravessa, a visão não. **Parede comum**: bloqueia tudo.
- [ ] Escolher (ou arrastar) **todos os `.dd2vtt` de uma vez** cria um cartão por andar, **na ordem dos andares**, com o nome do andar e elevações 0, 3, 6...
- [ ] Cada cartão mostra "do mod Nauren", "andar X de Y", "N molduras identificadas" e o campo de URL sugere qual imagem colar.
- [ ] O nome da cena vem sem o sufixo do andar (ex.: `Casa`).
- [ ] **Arte pela moldura** (ligado): cada porta recebe a folha do mesmo material e cor da moldura (pedra ardósia → porta de pedra ardósia, metal cinza → porta de metal cinza); janelas pelo batente.
- [ ] As folhas ficam exatamente entre os postes (abertura medida pelo mod), inclusive em molduras de outros pacotes.
- [ ] Desligando **Arte pela moldura**, todas usam a arte padrão escolhida.
- [ ] Arquivos `.dd2vtt` comuns (sem o mod) continuam funcionando como antes.

## Andares, escadas e elevadores (1.7.0) — numa cena com 2+ andares
- [ ] Aba **Cenas** → botão **Andares** abre o gerenciador (também nas barras das camadas de **Tiles** e **Regiões**, ícone de camadas).
- [ ] A lista mostra os andares de cima para baixo, com o que tem em cada um (ex.: "3 tiles · 40 paredes"); o andar que você está vendo fica com borda dourada.
- [ ] Mudar nome, URL da imagem, chão/teto e **Inicial** salva na hora (sai do campo ou Enter).
- [ ] Botão do olho troca o andar que você está vendo.
- [ ] **Vê os andares de baixo** liga/desliga a visão dos andares de baixo (varanda, mezanino).
- [ ] Clique direito num **tile** → botão de camadas no menu → lista de andares: clicar move o tile (ou todos os selecionados) para aquele andar; Shift+clique acrescenta/tira; **Todos os andares** deixa em todos.
- [ ] O mesmo botão aparece no menu de **luzes** e **sons** (se o Foundry mostrar menu para eles).
- [ ] Selecionar paredes (ou qualquer coisa da camada atual) e clicar na seta de um andar no gerenciador leva tudo para aquele andar.
- [ ] Objeto novo colocado no mapa entra no andar que você está vendo (isso é do próprio Foundry).
- [ ] **Escada**: escolher os dois andares → **Marcar no mapa** → um quadrado dourado segue o mouse mostrando onde vai pintar.
- [ ] Clicar e arrastar pinta quadrados; **Shift** (ou a ferramenta Apagar) apaga; **Retângulo** preenche de um canto ao outro; pincel **1×1 / 2×2 / 3×3** (teclas 1, 2, 3).
- [ ] Roda do mouse dá zoom e botão direito arrasta o mapa enquanto edita; **Ctrl+Z** desfaz, **Ctrl+Y** refaz; **Enter** salva, **Esc** cancela.
- [ ] Token andando para dentro da escada no térreo sobe; no andar de cima, entrando na mesma área, desce.
- [ ] Na lista de escadas/elevadores: lápis **Editar a área** abre o editor já com os quadrados atuais; dá para acrescentar e tirar quadrados e salvar.
- [ ] Engrenagem **Trocar andares e opções**: muda escada↔elevador, os andares ligados e "Jogadores veem a área"; **Salvar** atualiza.
- [ ] **Elevador**: marcar 3 andares → pintar → ao entrar, o Foundry pergunta/leva para outro andar. (Anote como ele se comporta com 3 andares.)
- [ ] **Usar a região selecionada**: desenhe uma região normal na camada de Regiões, selecione, e transforme em escada.
- [ ] O alvo centraliza o mapa na escada; a lixeira pergunta antes de apagar.
- [ ] **Novo andar**: nome + URL (+ .dd2vtt opcional) cria o andar em cima do mais alto; com .dd2vtt vêm paredes, portas (com arte) e luzes nesse andar.
- [ ] Apagar andar pergunta antes e oferece apagar também os objetos que estão só nele.

## Não quebrou
- [ ] Importar um mapa sem configurar pastas continua funcionando (portas sem arte).
- [ ] Vários andares: portas e janelas ficam presas ao andar certo.
- [ ] Luzes "Só para visão" e reescala da imagem continuam iguais à 1.3.
