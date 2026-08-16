# SAEL Honduras — Sistema Web de Inscripciones

Sistema web para la gestión de inscripciones, participantes y finanzas del **S.A.E.L.** (Seminario Avanzado de Entrenamiento de Líderes), un ministerio de FIHNEC.

## ¿Qué es el SAEL?

El Seminario Avanzado de Entrenamiento de Líderes es un encuentro personal donde hombres, mujeres y jóvenes se acercan al propósito que Dios tiene para sus vidas. Se imparte mensualmente (11 eventos al año, de Enero a Noviembre), con duración de 3 días cada uno, calendarizado los fines de semana.

## Objetivo del sistema

- Inscripciones web propias para las capacitaciones del SAEL (participantes nacionales y extranjeros)
- Base de datos centralizada de participantes nuevos y repitentes
- Panel administrativo con reportería, estadísticas y control de módulos
- Módulo financiero de ingresos y egresos
- Gestión de diplomas
- Configuración de eventos mensuales

## Stack tecnológico

- **Frontend**: React + Vite + Tailwind CSS — desplegado en Netlify
- **Backend**: Node.js + Express — desplegado en Render
- **Base de datos**: PostgreSQL — alojada en Neon
- **Dominio**: saelhonduras.com (GoDaddy)

## Estructura del repositorio

```
/backend    → API REST (Node/Express)
/frontend   → Aplicación web (React/Vite/Tailwind)
```

## Módulos planificados

- Usuarios (roles y permisos administrativos)
- Participantes Nacionales (registro público vía formulario)
- Participantes Extranjeros (carga manual por administrador)
- Diplomas
- Financiero (ingresos y egresos)
- Reportería
- Estadísticas
- Mantenimiento / Configuración de eventos

## Convención de versionado

- **PATCH** (x.x.N): cambios que solo tocan `backend/`
- **MINOR** (x.N.0): cambios que tocan `frontend/`
- **MAJOR** (N.0.0): por mutuo acuerdo entre el equipo

Ver `CHANGELOG.md` para el historial de cambios.

## Autoría

Ver `AUTORIA.md`.
