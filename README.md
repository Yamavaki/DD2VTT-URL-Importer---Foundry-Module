# DD2VTT URL Importer (módulo do Foundry VTT)

Importa mapas do Dungeondraft (`.dd2vtt` / `.uvtt`) para o Foundry VTT V14 usando uma **URL externa** para a imagem do mapa (Imgur, Google Drive, Biblioteca de Assets da Forge...), para não ocupar espaço no servidor. Reescala a grade sozinho.

## O que faz
- Paredes, portas, janelas e luzes do `.dd2vtt`; portas e janelas animadas com artes escolhidas numa galeria (pasta de artes configurável).
- Vários andares (Scene Levels do V14): um export por andar, visão entre andares e iluminação global.
- Gerenciador **Andares**: nomes, imagens, chão/teto, quem vê quem, escadas e elevadores (região "Change Level") desenhados por quadrados.
- Andar de cima que some (fade) quando o token passa embaixo ou o mouse passa por cima.
- Ferramentas **Estilo de portas** e **Luzes da cena**.

Feito para usar junto com o mod do Dungeondraft **Exportar para Foundry (Nauren)**, que grava no `.dd2vtt` o nome do andar, a moldura de cada porta e as paredes "Allow Light".

## Instalar
Copie a pasta para `Data/modules/dd2vtt-url-importer` (o `id` do módulo é `dd2vtt-url-importer`) e ative no mundo.

## Testes
A lista do que conferir a cada versão está em `TESTES.md`.
