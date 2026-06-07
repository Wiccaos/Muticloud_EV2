#!/bin/bash
# Script para hacer backup de AWS RDS y subirlo a AWS S3 con ACL
# Ejecutar con Cron cada 24 horas: 0 2 * * * /ruta/al/script/backup_rds_s3.sh

FECHA=$(date +%Y-%m-%d_%H-%M-%S)
ARCHIVO_BACKUP="simi_erp_backup_$FECHA.sql"
BUCKET_NAME="mi-bucket-simi-backups-2026" # Cambia esto por tu bucket
RDS_ENDPOINT="tu-instancia.xxxx.us-east-1.rds.amazonaws.com" # Cambia esto por tu RDS

echo "Iniciando respaldo de la base de datos RDS..."
PGPASSWORD="tu_password_rds" pg_dump -h $RDS_ENDPOINT -U postgres -d postgres -F c -f /tmp/$ARCHIVO_BACKUP

echo "Subiendo a AWS S3 con control de acceso (ACL)..."
# --acl private asegura que el objeto no sea público
aws s3 cp /tmp/$ARCHIVO_BACKUP s3://$BUCKET_NAME/$ARCHIVO_BACKUP --acl private

echo "Limpiando archivo local..."
rm /tmp/$ARCHIVO_BACKUP
echo "Backup finalizado exitosamente."