-- Pestaña ANS Selección en Maestro_Menu para monitoreo de cumplimiento y tiempos
INSERT IGNORE INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
VALUES ('talenthub', 'AnsSeleccion', 'Sistema, Directorth, CoorSelección', 1,
        'ANS Selección', '/talenthub?tab=AnsSeleccion', 3, '◉',
        'Monitoreo y reporte interactivo de cumplimiento de tiempos de selección por responsable y requisición.');
