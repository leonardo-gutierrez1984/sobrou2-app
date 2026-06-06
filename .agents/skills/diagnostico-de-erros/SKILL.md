---
name: diagnostico-de-erros
description: Use SEMPRE que aparecer um erro, mensagem vermelha, stack trace, tela vermelha do Expo, falha de build/bundle, aviso (warning) que quebra o app, ou quando o app não rodar ou travar. Acione quando o usuário colar uma mensagem de erro ou disser coisas como "deu erro", "não funciona", "quebrou", "tela vermelha", "não carrega", "não builda" ou pedir ajuda para entender/corrigir um problema. Acione TAMBÉM no fim de cada sessão de trabalho — quando o usuário disser que vai parar, fechar, encerrar, "por hoje é isso", antes de commitar/subir pro GitHub, ou quando terminar uma alteração — para rodar a verificação final de qualidade. Projeto: Sobrou 2.0 (React Native + Expo).
---

# Diagnóstico de Erros — Sobrou 2.0 (React Native + Expo)

## Quem é o usuário
O Leo é desenvolvedor **iniciante**. Ele segue instruções, cola prompts, roda comandos e
interpreta erros, mas **não escreve código do zero**. Trate-o como inteligente, mas explique
sem jargão. Nunca responda só com código solto sem dizer o que ele faz e onde colar.

## Regra de ouro
NUNCA despeje só a solução técnica. Sempre siga esta ordem ao encontrar um erro.

### 1. Traduza o erro em português simples
Pegue a mensagem de erro e diga, em UMA frase, o que ela significa na prática.
Ex.: "Esse erro quer dizer que o app tentou usar uma tela que não existe / não foi importada."

### 2. Aponte a causa provável
Diga onde está o problema e por que aconteceu. Se houver mais de uma causa possível,
liste no máximo as 2 ou 3 mais prováveis, da mais comum para a menos comum.

### 3. Dê o conserto passo a passo
- Diga EXATAMENTE qual arquivo abrir e em qual linha (quando der pra saber pelo erro).
- Quando for mudar código, mostre o "antes" e o "depois", e diga onde colar.
- Quando for um comando, escreva o comando pronto pra copiar e diga onde rodar
  (terminal do VS Code, na pasta do projeto).
- Um passo de cada vez quando o conserto for arriscado ou longo.

### 4. Confirme se resolveu
Termine perguntando o que aconteceu depois (sumiu o erro? apareceu outro?), porque
muitas vezes consertar um erro revela o próximo.

## Antes de mudar qualquer coisa
- Se o erro não tiver informação suficiente, peça pra ele colar a mensagem COMPLETA
  (incluindo as linhas de baixo / o "stack trace") ou um print.
- Se o conserto envolver apagar ou sobrescrever algo, avise e confirme antes.
- Se houver risco de quebrar o que já funciona, sugira commitar no Git antes
  ("salvar o estado atual") para poder voltar.

## Erros comuns deste projeto (Expo / React Native) e o que costumam significar
- **"Unable to resolve module ..."** → faltou instalar um pacote (`npm install`) ou o
  caminho do import está errado.
- **Tela vermelha "Element type is invalid"** → um componente foi importado errado
  (import com chaves `{ }` vs sem chaves) ou o arquivo não exporta o componente.
- **"Metro bundler" travado / app não atualiza** → reiniciar com cache limpo:
  `npx expo start -c`.
- **"undefined is not an object" / "cannot read property of undefined"** → o código tentou
  ler algo que ainda não existe (dado que não chegou, estado vazio, ou nome digitado errado).
- **Build/instalação falhando** → ver versão do Node, se as dependências foram instaladas,
  e se o pacote é compatível com a versão do Expo (SDK).

## Verificação de fim de sessão (checklist de qualidade)
Quando o usuário sinalizar que vai parar/encerrar, ou antes de commitar/subir pro GitHub,
faça esta revisão ANTES de ele fechar e relate o resultado em português simples.
Não diga só "está tudo certo" — mostre o que foi conferido.

1. **O código está quebrando?**
   - Rode (ou peça pra ele rodar) `npx expo start` e veja se o app sobe sem tela vermelha.
   - Se houver checagem de tipos no projeto, rode `npx tsc --noEmit` e relate os erros.

2. **Está consistente?**
   - Veja se os arquivos novos/alterados seguem o mesmo padrão dos já existentes
     (nomes, forma de importar, organização das pastas).
   - Aponte qualquer coisa "fora do padrão" que possa confundir mais tarde.

3. **Há erros canônicos / comuns?**
   - Imports faltando ou errados, variáveis usadas sem existir, chaves `{ }` esquecidas,
     `console.log` deixado pra trás, código duplicado, dependências não instaladas.
   - Se o projeto tiver linter (ESLint), rode `npx eslint .` e resuma os apontamentos.

4. **Está certo (faz o que devia)?**
   - Confirme se a alteração desta sessão realmente resolve o que o Leo queria,
     e não só "compila". Se possível, descreva como ele pode testar na prática.

### Como relatar
Use um resumo curto com status claro, por exemplo:
- ✅ App sobe sem erro
- ⚠️ 2 avisos de import não usado em `telas/Estoque.js` (não quebra, mas vale limpar)
- ❌ Falta instalar o pacote `date-fns` — rodar `npm install date-fns`

Se achar algo ❌ (que quebra), conserte seguindo a "Regra de ouro" acima ANTES de
recomendar o commit. Só sugira subir pro GitHub quando não houver mais ❌.

## Tom
Calmo e encorajador. Erro faz parte do processo — nunca passe a sensação de que ele errou
"feio". O objetivo é ele entender o porquê, não só copiar a correção.