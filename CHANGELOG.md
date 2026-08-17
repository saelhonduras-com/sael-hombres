# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Convención de versión: PATCH = solo backend, MINOR = toca frontend, MAJOR = mutuo acuerdo.

## [0.5.0] - 2026-08-16

### Changed
- Proyecto renombrado de "SAEL" genérico a **SAEL Hombres**, primero de cuatro sistemas hermanos (Hombres, Damas, Señoritas, Jóvenes) que compartirán el dominio `saelhonduras.com`, cada uno con repo, base de datos y despliegue independientes
- Repo de GitHub renombrado a `sael-hombres`
- `package.json` (backend y frontend) y navbar actualizados con el nombre "SAEL Hombres"

## [0.4.0] - 2026-08-16

### Added
- Página principal pública (`Home.jsx`) con hero, contador regresivo al cierre de inscripción del próximo encuentro, tarjeta de "Próximo encuentro SAEL" y sección "¿Cómo funciona el registro?"
- Componente `Contador.jsx` (cuenta regresiva en vivo)
- Cliente API (`api.js`) con axios
- Enrutamiento básico (`react-router-dom`) con rutas placeholder para `/registro` y `/autoconsulta`

## [0.3.0] - 2026-08-16

### Added
- Corredor de migraciones SQL (`backend/scripts/aplicar_una_migracion.js`)
- Tabla `eventos` en base de datos (encuentros mensuales SAEL): nombre, año, mes, fechas de inicio/fin, fecha límite de registro, estado abierto/cerrado, marcador de "evento actual"
- Endpoint público `GET /api/eventos`

## [0.2.0] - 2026-08-15

### Added
- Scaffold inicial de `backend/` (Node.js/Express): `server.js`, conexión a PostgreSQL (`db.js`), ruta de salud (`/api/salud`, `/api/salud-completa`), manejo de errores async, `.env.example`
- Scaffold inicial de `frontend/` (React/Vite/Tailwind): configuración base, página de bienvenida temporal

## [0.1.0] - 2026-08-15

### Added
- Estructura inicial del repositorio (`README.md`, `CHANGELOG.md`, `AUTORIA.md`, `.gitignore`)
- Definición del proyecto y alcance inicial basado en documento de requerimientos SAEL
