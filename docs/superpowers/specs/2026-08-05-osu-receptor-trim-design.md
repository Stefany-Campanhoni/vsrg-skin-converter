# Recorte vertical do receptor do osu!

## Objetivo

Disponibilizar um comando npm de teste que leia `.tmp/key.png` e gere
`.tmp/key-trimmed.png`, removendo as margens transparentes acima e abaixo do
receptor, sem alterar o arquivo de origem.

## Abordagem

O script usará `sharp.trim()`, a opção recomendada para detectar o conteúdo
não transparente da imagem. O PNG de saída preservará a transparência e será
gravado com largura original; como a imagem de entrada só tem espaços vazios
na vertical, o resultado esperado é um recorte apenas do topo e da base.

## Interface

O `package.json` receberá o comando `test:trim-osu-receptor`, que executará o
script TypeScript. Ao terminar, o script informará no terminal as dimensões da
imagem antes e depois do recorte. Se `.tmp/key.png` não existir ou não puder
ser processada, o comando terminará com erro.

## Testes

Um teste automatizado criará uma imagem temporária com conteúdo opaco cercado
por linhas transparentes, executará a função de recorte e verificará que:

- a largura não muda;
- as margens verticais transparentes são removidas;
- os pixels visíveis continuam presentes.

## Escopo

Não há alteração no fluxo principal de conversão de skins e nenhum arquivo em
`.tmp` existente será sobrescrito exceto `.tmp/key-trimmed.png` ao executar o
novo comando.
