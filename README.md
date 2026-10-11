# Field Survey Companion

Resolva quaisquer bugs nesse app https://github.com/Amanokk/liiiiiiiiiiii.git

Crie um aplicativo web/mobile responsivo para levantamento de campo de obras de pavimentação e acessibilidade.



OBJETIVO PRINCIPAL



O aplicativo será usado no celular diretamente durante o trabalho na rua.



O usuário deverá conseguir:

1. Ver sua localização atual através do GPS do celular em tempo real.

2. Visualizar sua posição sobre um mapa.

3. Caminhar pela rua e registrar elementos exatamente no local onde está.

4. Registrar pontos e trajetos no mapa.

5. Salvar tudo automaticamente.

6. Continuar trabalhando mesmo com conexão de internet instável, sempre que possível.

7. Consultar, editar e apagar os registros feitos.



TIPOS DE ELEMENTOS



Criar os seguintes tipos de registro:



1. CAIXA-RALO

- Tipo: ponto

- Cor: vermelho

- Ícone: caixa/ralo

- Ao registrar, salvar latitude e longitude.

- Permitir adicionar observação.

- Permitir adicionar foto.

- Gerar automaticamente um número sequencial para cada caixa-ralo.



2. DEFICIENTE / ACESSIBILIDADE

- Tipo: ponto

- Cor: azul

- Ícone de acessibilidade ♿

- Registrar latitude e longitude.

- Permitir observação.

- Permitir foto.

- Usar para marcar rampas, acessos ou pontos destinados à acessibilidade.



3. CALÇADA

- Tipo: linha/polilinha

- Cor: azul-claro

- O usuário deverá poder iniciar o registro da calçada.

- Enquanto caminha, o aplicativo deve registrar os pontos do trajeto através do GPS.

- O usuário poderá tocar em "Finalizar calçada".

- A linha ficará salva no mapa.

- Permitir informar observações e foto.

- Mostrar o comprimento aproximado em metros.



4. PISO TÁTIL

- Tipo: linha/polilinha

- Cor: AMARELO

- O usuário inicia o registro do piso tátil.

- Enquanto caminha, o GPS registra o trajeto.

- Ao finalizar, salvar a linha.

- Mostrar o comprimento aproximado em metros.

- Permitir observação e foto.

- Usar amarelo forte e bem visível no mapa.



5. MEIO-FIO

- Tipo: linha/polilinha

- Cor: VERDE

- Permitir registrar o trajeto do meio-fio através do GPS.

- Mostrar comprimento em metros.

- Permitir observações e fotos.



6. ASFALTO

- Tipo: linha/polilinha

- Cor: PRETO ou CINZA ESCURO

- Permitir registrar trechos executados.

- Mostrar comprimento.

- Permitir observações e fotos.



MAPA



Usar um mapa interativo apropriado para celular.



Mostrar:

- mapa base;

- marcador da localização atual do usuário;

- direção/movimento do usuário quando disponível;

- todos os elementos já cadastrados;

- legenda com as cores;

- zoom;

- botão para centralizar na minha localização.



A localização do usuário deve ser atualizada continuamente enquanto o aplicativo estiver aberto.



IMPORTANTE SOBRE GPS



Não simplesmente registrar uma posição fixa quando o usuário abrir o aplicativo.



Usar a API de geolocalização do navegador/celular com:

- latitude;

- longitude;

- accuracy;

- heading quando disponível;

- velocidade quando disponível;

- timestamp.



Mostrar na tela a precisão aproximada do GPS, por exemplo:



"Precisão GPS: ±5 m"



Se a precisão estiver ruim, avisar o usuário:



"GPS com baixa precisão. Aguarde alguns segundos antes de registrar."



AO REGISTRAR UM PONTO



Criar um botão grande e fácil de tocar chamado:



"+ MARCAR"



Ao tocar, abrir uma pequena janela:



O que deseja marcar?



[ CAIXA-RALO ]

[ DEFICIENTE ]

[ INICIAR CALÇADA ]

[ INICIAR PISO TÁTIL ]

[ INICIAR MEIO-FIO ]

[ INICIAR ASFALTO ]



Para elementos pontuais, registrar imediatamente a localização atual.



Para elementos lineares, iniciar uma gravação GPS.



GRAVAÇÃO DE LINHAS



Quando o usuário iniciar uma linha, mostrar uma barra fixa:



"GRAVANDO PISO TÁTIL"



Distância: 37,4 m

Pontos GPS: 42

Precisão: ±4 m



Botões:



[ PAUSAR ]

[ FINALIZAR ]



Enquanto o usuário caminha, registrar pontos GPS periodicamente.



Não registrar milhares de pontos desnecessários. Aplicar simplificação/filtragem para manter o mapa leve.



Ao finalizar:

- salvar a linha;

- calcular distância;

- mostrar resumo;

- permitir observação;

- permitir foto.



MODO DE TRABALHO



Criar dois modos:



MODO CAMPO

Interface extremamente simples para trabalhar na rua.



Mostrar principalmente:

- mapa;

- localização atual;

- botão MARCAR;

- botão de iniciar linha;

- legenda;

- registros próximos.



MODO MAPA

Permitir visualizar todos os elementos cadastrados.



Criar filtros:



☑ Caixa-ralo

☑ Deficiente

☑ Calçada

☑ Piso tátil

☑ Meio-fio

☑ Asfalto



Permitir ligar/desligar cada categoria.



REGISTROS



Cada registro deve possuir:



- ID

- tipo

- latitude

- longitude

- geometria, quando for uma linha

- data

- hora

- precisão do GPS

- observação

- fotos

- usuário, se houver sistema de usuários



Para linhas:

- quantidade de pontos GPS

- comprimento em metros

- coordenadas completas da linha



BANCO DE DADOS



Criar estrutura adequada para armazenar os levantamentos.



Preferencialmente utilizar Supabase para:

- banco de dados;

- autenticação;

- armazenamento de fotos.



Cada levantamento deve ficar associado ao projeto.



Criar conceito de:



PROJETO

- nome

- local

- data de criação



Dentro de cada projeto existem os elementos levantados.



OFFLINE



O aplicativo será utilizado na rua e pode ficar sem internet.



Implementar armazenamento local temporário.



Se perder internet:

- continuar mostrando a localização;

- continuar permitindo registrar pontos;

- continuar gravando linhas;

- armazenar os dados localmente.



Quando a internet voltar:

- sincronizar automaticamente os registros com o banco.



Nunca apagar um levantamento local antes de confirmar que ele foi sincronizado.



FOTOS



Ao registrar qualquer elemento, permitir:



[TIRAR FOTO]



Abrir a câmera do celular quando possível.



Associar a foto ao registro.



LISTA DE REGISTROS



Criar uma tela "Registros".



Mostrar:



Caixa-ralo 001

Caixa-ralo 002

Deficiente 001

Calçada 001

Piso tátil 001

Meio-fio 001

Asfalto 001



Ao tocar em um registro:

- mostrar no mapa;

- mostrar coordenadas;

- mostrar data/hora;

- mostrar precisão;

- mostrar fotos;

- mostrar observação;

- permitir editar;

- permitir excluir.



EXPORTAÇÃO



Criar botão:



"EXPORTAR"



Permitir exportar os dados em:



- CSV

- GeoJSON

- KML



O GeoJSON deve preservar corretamente pontos e linhas para que os dados possam ser posteriormente utilizados em softwares GIS.



DASHBOARD



Criar uma tela de resumo do projeto:



CAIXAS-RALO: 32

DEFICIENTE: 14

CALÇADA: 1.248 m

PISO TÁTIL: 843 m

MEIO-FIO: 1.530 m

ASFALTO: 2.140 m



Os números devem ser calculados automaticamente a partir dos registros.



VISUAL



O aplicativo deve ser pensado primeiro para celular.



Interface:

- simples;

- profissional;

- botões grandes;

- fácil de usar com uma mão;

- alto contraste;

- mapa ocupando a maior parte da tela;

- poucos menus;

- sem elementos desnecessários.



Criar uma legenda visual:



🔴 Caixa-ralo

🔵 Deficiente

🔷 Calçada

🟡 Piso tátil

🟢 Meio-fio

⚫ Asfalto



IMPORTANTE



Não inventar coordenadas, ruas ou elementos.



Todos os elementos registrados devem vir da localização GPS do aparelho ou de registros inseridos manualmente pelo usuário.



O sistema deve mostrar claramente a precisão do GPS e guardar essa precisão junto com cada registro.



Criar o projeto de forma organizada e modular, separando:

- mapa;

- GPS;

- registros;

- banco de dados;

- armazenamento de fotos;

- sincronização offline;

- exportação;

- interface mobile.



Antes de finalizar, testar especialmente:

1. Permissão de localização no Android.

2. Atualização da localização em tempo real.

3. Registro de ponto.

4. Gravação de linha enquanto o usuário caminha.

5. Pausar e continuar uma linha.

6. Finalizar linha.

7. Cálculo da distância.

8. Salvamento offline.

9. Sincronização posterior.

10. Exportação GeoJSON.

11. Fotos pela câmera do celular.

12. Funcionamento em tela pequena.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fieldy-map-buddy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/32e6b351-e3e1-42af-824b-91e9e77e23c7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
