-- Estado inicial "vacio": el expediente que se crea solo al completar la extracción de un cliente.
ALTER TYPE "EstadoExpediente" ADD VALUE IF NOT EXISTS 'vacio' BEFORE 'en_captura';
