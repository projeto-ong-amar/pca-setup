# Stack Docker do Projeto AMAR

Compose com **MySQL 8 + Spring Boot + nginx**. O nginx serve o build estatico
do frontend (SPA) e faz proxy de `/api/*` para o backend no **mesmo origin** —
necessario porque o cookie de sessao `authToken` e `SameSite=Strict`.

```
Internet ──> nginx :80 (frontend)
               ├── /api/*  ──> backend :8080  (strip do /api)
               └── /*      ──> build Vite (dist/)
                    MySQL 8 (rede interna)
```

## Uso (recomendado)

Deixe o bootstrap clonar os apps para `~/projeto-ong-amar/{backend,frontend}`,
depois rode:

```powershell
# Windows
pca-setup hosting --stack <caminho>\pca-setup\stack --domain localhost
```

```bash
# Linux / macOS / WSL
pca-setup hosting --stack ~/.../pca-setup/stack --domain localhost
```

O `hosting` gera o `.env` (segredos aleatorios), exporta os dirs de build e
sobe a stack com `docker compose up -d --build`. Em producao troque `--domain`
e adicione `--email` para o Let's Encrypt.

## Como o compose acha os apps

O `docker-compose.yml` constrói a partir de tres variaveis (exportadas pelo
`hosting`, ou definidas manualmente):

| Variavel | Significado | Default do hosting |
|---|---|---|
| `BACKEND_DIR` | Repo do backend (contexto de build) | `~/projeto-ong-amar/backend` |
| `FRONTEND_DIR` | Repo do frontend (contexto de build) | `~/projeto-ong-amar/frontend` |
| `STACK_DIR` | Esta pasta (onde estao os Dockerfiles) | proprio `stack/` |

## Subir na mao (sem o hosting)

```bash
cd stack
cp .env.example .env   # preencha os valores (ou rode o hosting uma vez)
export STACK_DIR=$PWD BACKEND_DIR=$HOME/projeto-ong-amar/backend FRONTEND_DIR=$HOME/projeto-ong-amar/frontend
docker compose up -d --build
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Orquestra db + backend + frontend |
| `backend.Dockerfile` | Build Maven (wrapper `mvnw`) -> JRE 21 |
| `frontend.Dockerfile` | Build Vite (`VITE_API_URL=/api`) -> nginx |
| `nginx.conf` | SPA + proxy `/api/` (strip) para o backend |
| `.env.example` | Referencia para subir sem o hosting |

## Notas

- **Tabelas**: o backend usa `ddl-auto=update` e cria as tabelas via JPA no
  startup. Os scripts em `projeto-ong-amar-banco-de-dados/script/` sao o
  modelamento oficial e podem ser aplicados manualmente se preferir.
- **HTTPS/cookie**: o perfil `prod` do Spring fixa `cookie.secure` e
  `require-https` como `true`. O compose os sobrescreve por env var
  (`SECURITY_COOKIE_SECURE`, `SECURITY_TRANSPORT_REQUIRE_HTTPS`,
  `SECURITY_CORS_ALLOWED_ORIGINS`) usando os valores do `.env`, permitindo
  rodar em HTTP local (nginx same-origin) e em HTTPS em producao.
