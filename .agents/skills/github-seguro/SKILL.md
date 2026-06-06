---
name: github-seguro
description: Use SEMPRE que o assunto for salvar, versionar ou subir código para o GitHub, ou desfazer/voltar atrás. Acione quando o usuário disser coisas como "vou commitar", "fazer commit", "subir pro GitHub", "salvar no git", "dar push", "como salvo isso", "deu ruim, quero voltar", "desfazer", "reverter", "voltar pro que funcionava", "perdi meu código", ou pedir ajuda com Git/GitHub. Vale para qualquer projeto (Sobrou 2.0, tropa-do-tenis, Vozzy, Vigga).
---

# GitHub Seguro

## Quem é o usuário
O Leo é desenvolvedor **iniciante**. Ele tem medo (justo) de perder trabalho ou quebrar
o que já funciona. Explique sem jargão, com comandos prontos pra copiar, dizendo onde
rodar (terminal do VS Code, dentro da pasta do projeto) e o que cada um faz.

## Regra de ouro
NUNCA recomende subir pro GitHub sem antes rodar a **verificação de fim de sessão**
do skill `diagnostico-de-erros`. Se houver qualquer ❌ (algo quebrando), conserte primeiro.
Só libere o push quando estiver ✅.

## Salvar e subir (o fluxo normal)
Faça um passo de cada vez e mostre o comando pronto:

1. **Ver o que mudou** — `git status`
   Diga, em português, quais arquivos foram alterados/criados.
2. **Marcar tudo pra salvar** — `git add .`
3. **Salvar com uma descrição (commit)** — `git commit -m "descrição curta do que mudou"`
   - A mensagem deve ser curta, em português, dizendo O QUE mudou.
   - Exemplos bons: "adiciona tela de estoque", "corrige erro ao salvar sobra",
     "ajusta cores do menu". Evite "mudanças" ou "update" soltos.
4. **Subir pro GitHub** — `git push`
   - Se ele estiver subindo esse projeto pela primeira vez, o comando pode pedir mais
     coisa (ex.: `git push -u origin main`). Explique calmamente se aparecer.

## Desfazer com segurança (a parte que dá medo)
Antes de qualquer "desfazer", identifique em que ponto ele está, porque o comando muda:

- **Estraguei um arquivo e ainda NÃO salvei (commit)** → voltar esse arquivo pro último
  estado salvo: `git restore caminho/do/arquivo`. (Joga fora só as mudanças não salvas
  desse arquivo — confirme com ele antes.)
- **Marquei algo com `git add` e quero desmarcar** → `git restore --staged caminho/do/arquivo`
  (não apaga nada, só tira da fila do commit).
- **Fiz um commit e me arrependi, mas quero MANTER o código** → `git reset --soft HEAD~1`
  (desfaz só o commit, o código continua lá).
- **Quero jogar TUDO fora e voltar pro último commit** → `git reset --hard HEAD`
  ⚠️ PERIGO: isso apaga as mudanças não salvas de vez. NUNCA rode sem avisar e confirmar
  explicitamente com o Leo. Sempre ofereça a opção mais leve antes dessa.

## Rede de segurança: checkpoint antes de mexer em algo arriscado
Quando o Leo for tentar uma mudança grande ou arriscada, sugira **salvar antes** com um
commit ("checkpoint"). Assim, se quebrar, dá pra voltar pro ponto bom com tranquilidade.
Frase pra ele: "Antes de mexer nisso, vamos salvar o estado atual pra poder voltar."

## Regras de segurança
- Sempre confirme antes de qualquer comando que APAGA mudanças (`reset --hard`, `restore`).
- Prefira sempre a opção reversível. Só vá pra opção destrutiva se for mesmo necessário
  e depois de explicar o que será perdido.
- Nunca o mande digitar senha, token ou credencial num comando ou arquivo. Se o GitHub
  pedir login, oriente-o a fazer pela tela oficial do GitHub/VS Code, não colando segredos.

## Tom
Calmo e tranquilizador. O objetivo é o Leo nunca sentir que pode "perder tudo".
Git é justamente a rede de segurança — reforce isso.