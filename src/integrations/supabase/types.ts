export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _lovable_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      almacenes: {
        Row: {
          activo: boolean
          codigo: string | null
          created_at: string
          direccion: string | null
          empresa_id: string | null
          id: string
          nombre: string
          principal: boolean
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          direccion?: string | null
          empresa_id?: string | null
          id?: string
          nombre: string
          principal?: boolean
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          created_at?: string
          direccion?: string | null
          empresa_id?: string | null
          id?: string
          nombre?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          activa: boolean
          alias: string
          banco: string
          clabe: string | null
          created_at: string
          created_by: string | null
          cuenta_contable_id: string | null
          empresa_id: string
          id: string
          moneda: string
          notas: string | null
          numero_cuenta: string | null
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          alias: string
          banco: string
          clabe?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_contable_id?: string | null
          empresa_id: string
          id?: string
          moneda?: string
          notas?: string | null
          numero_cuenta?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          alias?: string
          banco?: string
          clabe?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_contable_id?: string | null
          empresa_id?: string
          id?: string
          moneda?: string
          notas?: string | null
          numero_cuenta?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bank_accounts_cuenta_contable_id_fkey"
            columns: ["cuenta_contable_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_movements: {
        Row: {
          ai_categoria: string | null
          ai_confianza: number | null
          categoria: string | null
          conciliado: boolean
          conciliado_at: string | null
          conciliado_by: string | null
          contraparte: string | null
          created_at: string
          created_by: string | null
          cuenta_id: string
          descripcion: string | null
          empresa_id: string
          fecha: string
          id: string
          monto: number
          notas: string | null
          payroll_payment_id: string | null
          referencia: string | null
          statement_id: string | null
          tipo: Database["public"]["Enums"]["bank_movement_kind"]
          transfer_id: string | null
          updated_at: string
          uuid_cfdi: string | null
        }
        Insert: {
          ai_categoria?: string | null
          ai_confianza?: number | null
          categoria?: string | null
          conciliado?: boolean
          conciliado_at?: string | null
          conciliado_by?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_id: string
          descripcion?: string | null
          empresa_id: string
          fecha: string
          id?: string
          monto: number
          notas?: string | null
          payroll_payment_id?: string | null
          referencia?: string | null
          statement_id?: string | null
          tipo: Database["public"]["Enums"]["bank_movement_kind"]
          transfer_id?: string | null
          updated_at?: string
          uuid_cfdi?: string | null
        }
        Update: {
          ai_categoria?: string | null
          ai_confianza?: number | null
          categoria?: string | null
          conciliado?: boolean
          conciliado_at?: string | null
          conciliado_by?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          cuenta_id?: string
          descripcion?: string | null
          empresa_id?: string
          fecha?: string
          id?: string
          monto?: number
          notas?: string | null
          payroll_payment_id?: string | null
          referencia?: string | null
          statement_id?: string | null
          tipo?: Database["public"]["Enums"]["bank_movement_kind"]
          transfer_id?: string | null
          updated_at?: string
          uuid_cfdi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_movements_conciliado_by_fkey"
            columns: ["conciliado_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bank_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bank_movements_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "bank_account_balances"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "bank_movements_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_movements_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_movements_payroll_payment_id_fkey"
            columns: ["payroll_payment_id"]
            isOneToOne: false
            referencedRelation: "payroll_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_movements_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_movements_transfer_fk"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "bank_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          bank_name: string | null
          created_at: string
          cuenta_id: string | null
          empresa_id: string
          error_message: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          periodo: string | null
          raw_data: Json | null
          saldo_final: number | null
          saldo_inicial: number | null
          status: string
          total_credits: number | null
          total_debits: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          bank_name?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id: string
          error_message?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          periodo?: string | null
          raw_data?: Json | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          status?: string
          total_credits?: number | null
          total_debits?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bank_name?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id?: string
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          periodo?: string | null
          raw_data?: Json | null
          saldo_final?: number | null
          saldo_inicial?: number | null
          status?: string
          total_credits?: number | null
          total_debits?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "bank_account_balances"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "bank_statements_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bank_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          cuenta_destino_id: string
          cuenta_origen_id: string
          empresa_id: string
          fecha: string
          id: string
          monto: number
          notas: string | null
          referencia: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cuenta_destino_id: string
          cuenta_origen_id: string
          empresa_id: string
          fecha: string
          id?: string
          monto: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cuenta_destino_id?: string
          cuenta_origen_id?: string
          empresa_id?: string
          fecha?: string
          id?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bank_transfers_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "bank_account_balances"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "bank_transfers_cuenta_destino_id_fkey"
            columns: ["cuenta_destino_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "bank_account_balances"
            referencedColumns: ["cuenta_id"]
          },
          {
            foreignKeyName: "bank_transfers_cuenta_origen_id_fkey"
            columns: ["cuenta_origen_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      bonifications_received: {
        Row: {
          amount: number
          created_at: string
          id: string
          month: string
          notes: string | null
          product_id: string | null
          received_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          product_id?: string | null
          received_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          product_id?: string | null
          received_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      centrales: {
        Row: {
          address: string | null
          city: string | null
          contact: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          petfood_potential_tier: string | null
          phone: string | null
          state: string | null
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          petfood_potential_tier?: string | null
          phone?: string | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          petfood_potential_tier?: string | null
          phone?: string | null
          state?: string | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          is_pinned: boolean
          messages: Json
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_pinned?: boolean
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_pinned?: boolean
          messages?: Json
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      client_price_overrides: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          price_with_iva: number
          product_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          price_with_iva: number
          product_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          price_with_iva?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "client_price_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "client_price_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      cliente_credito: {
        Row: {
          bloqueado: boolean
          cliente_id: string
          condicion_pago: string | null
          created_at: string
          dias_credito: number
          email_cobranza: string | null
          enviar_recordatorios: boolean
          freq_edo_cuenta: string
          gestor_id: string | null
          limite_credito: number
          motivo_bloqueo: string | null
          notas: string | null
          pronto_pago_dias: number | null
          pronto_pago_porcentaje: number | null
          riesgo_manual:
            | Database["public"]["Enums"]["cliente_riesgo_nivel"]
            | null
          ultimo_edo_cuenta_at: string | null
          ultimo_score: number | null
          ultimo_score_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bloqueado?: boolean
          cliente_id: string
          condicion_pago?: string | null
          created_at?: string
          dias_credito?: number
          email_cobranza?: string | null
          enviar_recordatorios?: boolean
          freq_edo_cuenta?: string
          gestor_id?: string | null
          limite_credito?: number
          motivo_bloqueo?: string | null
          notas?: string | null
          pronto_pago_dias?: number | null
          pronto_pago_porcentaje?: number | null
          riesgo_manual?:
            | Database["public"]["Enums"]["cliente_riesgo_nivel"]
            | null
          ultimo_edo_cuenta_at?: string | null
          ultimo_score?: number | null
          ultimo_score_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bloqueado?: boolean
          cliente_id?: string
          condicion_pago?: string | null
          created_at?: string
          dias_credito?: number
          email_cobranza?: string | null
          enviar_recordatorios?: boolean
          freq_edo_cuenta?: string
          gestor_id?: string | null
          limite_credito?: number
          motivo_bloqueo?: string | null
          notas?: string | null
          pronto_pago_dias?: number | null
          pronto_pago_porcentaje?: number | null
          riesgo_manual?:
            | Database["public"]["Enums"]["cliente_riesgo_nivel"]
            | null
          ultimo_edo_cuenta_at?: string | null
          ultimo_score?: number | null
          ultimo_score_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_credito_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cliente_credito_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cliente_credito_historial: {
        Row: {
          campo: string
          changed_at: string
          changed_by: string | null
          cliente_id: string
          id: string
          motivo: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          changed_at?: string
          changed_by?: string | null
          cliente_id: string
          id?: string
          motivo?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          changed_at?: string
          changed_by?: string | null
          cliente_id?: string
          id?: string
          motivo?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: []
      }
      cliente_documentos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          nombre: string
          notas: string | null
          storage_path: string | null
          tipo: string
          updated_at: string
          url: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          nombre: string
          notas?: string | null
          storage_path?: string | null
          tipo: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          storage_path?: string | null
          tipo?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_documentos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cliente_riesgo_snapshots: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          dias_pago_prom: number | null
          factores: Json | null
          id: string
          modelo: string | null
          nivel: Database["public"]["Enums"]["cliente_riesgo_nivel"]
          recomendaciones: string | null
          saldo_total: number | null
          saldo_vencido: number | null
          score: number
          utilizacion_pct: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dias_pago_prom?: number | null
          factores?: Json | null
          id?: string
          modelo?: string | null
          nivel: Database["public"]["Enums"]["cliente_riesgo_nivel"]
          recomendaciones?: string | null
          saldo_total?: number | null
          saldo_vencido?: number | null
          score: number
          utilizacion_pct?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dias_pago_prom?: number | null
          factores?: Json | null
          id?: string
          modelo?: string | null
          nivel?: Database["public"]["Enums"]["cliente_riesgo_nivel"]
          recomendaciones?: string | null
          saldo_total?: number | null
          saldo_vencido?: number | null
          score?: number
          utilizacion_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_riesgo_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clientes: {
        Row: {
          active: boolean
          central: string | null
          cfdi_pdf_path: string | null
          client_type: string
          codigo_postal: string | null
          company: string | null
          contact: string | null
          created_at: string
          credit_limit: number | null
          curp: string | null
          delivery_notes: string | null
          delivery_window_from: string | null
          delivery_window_until: string | null
          direccion: string | null
          email: string | null
          email_extra: string | null
          facturapi_id: string | null
          google_place_id: string | null
          id: string
          lat: number | null
          lng: number | null
          nickname: string | null
          nombre_cfdi: string | null
          nombre_comercial: string | null
          notas: string | null
          payment_method: string | null
          payment_terms: number | null
          phone: string | null
          portal_activo: boolean
          price_list_id: string | null
          razon_social: string
          regimen_fiscal: string | null
          representante_id: string | null
          required_documents: Json
          rfc: string | null
          telefono: string | null
          token_portal: string
          updated_at: string
          uso_cfdi_default: string | null
        }
        Insert: {
          active?: boolean
          central?: string | null
          cfdi_pdf_path?: string | null
          client_type?: string
          codigo_postal?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string
          credit_limit?: number | null
          curp?: string | null
          delivery_notes?: string | null
          delivery_window_from?: string | null
          delivery_window_until?: string | null
          direccion?: string | null
          email?: string | null
          email_extra?: string | null
          facturapi_id?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nickname?: string | null
          nombre_cfdi?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          payment_method?: string | null
          payment_terms?: number | null
          phone?: string | null
          portal_activo?: boolean
          price_list_id?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          representante_id?: string | null
          required_documents?: Json
          rfc?: string | null
          telefono?: string | null
          token_portal?: string
          updated_at?: string
          uso_cfdi_default?: string | null
        }
        Update: {
          active?: boolean
          central?: string | null
          cfdi_pdf_path?: string | null
          client_type?: string
          codigo_postal?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string
          credit_limit?: number | null
          curp?: string | null
          delivery_notes?: string | null
          delivery_window_from?: string | null
          delivery_window_until?: string | null
          direccion?: string | null
          email?: string | null
          email_extra?: string | null
          facturapi_id?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          nickname?: string | null
          nombre_cfdi?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          payment_method?: string | null
          payment_terms?: number | null
          phone?: string | null
          portal_activo?: boolean
          price_list_id?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          representante_id?: string | null
          required_documents?: Json
          rfc?: string | null
          telefono?: string | null
          token_portal?: string
          updated_at?: string
          uso_cfdi_default?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      cobranza_alertas: {
        Row: {
          cliente_id: string
          created_at: string
          descripcion: string | null
          id: string
          kanban_card_id: string | null
          metadata: Json | null
          nivel: string
          resuelta: boolean
          resuelta_at: string | null
          resuelta_por: string | null
          score: number | null
          tipo: string
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descripcion?: string | null
          id?: string
          kanban_card_id?: string | null
          metadata?: Json | null
          nivel?: string
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_por?: string | null
          score?: number | null
          tipo: string
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          kanban_card_id?: string | null
          metadata?: Json | null
          nivel?: string
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_por?: string | null
          score?: number | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_alertas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_alertas_kanban_card_id_fkey"
            columns: ["kanban_card_id"]
            isOneToOne: false
            referencedRelation: "kanban_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_alertas_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cobranza_comunicaciones: {
        Row: {
          asunto: string | null
          canal: string
          cliente_id: string
          created_at: string
          created_by: string | null
          cuerpo_preview: string | null
          destinatario: string | null
          error: string | null
          estado: string
          factura_id: string | null
          id: string
          metadata: Json | null
          provider_id: string | null
          tipo: string
        }
        Insert: {
          asunto?: string | null
          canal?: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          cuerpo_preview?: string | null
          destinatario?: string | null
          error?: string | null
          estado?: string
          factura_id?: string | null
          id?: string
          metadata?: Json | null
          provider_id?: string | null
          tipo: string
        }
        Update: {
          asunto?: string | null
          canal?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          cuerpo_preview?: string | null
          destinatario?: string | null
          error?: string | null
          estado?: string
          factura_id?: string | null
          id?: string
          metadata?: Json | null
          provider_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "cobranza_comunicaciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      cobranza_config: {
        Row: {
          clave: string
          descripcion: string | null
          id: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          descripcion?: string | null
          id?: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          descripcion?: string | null
          id?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      cobranza_gestiones: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          factura_id: string | null
          id: string
          monto_comprometido: number | null
          next_action_at: string | null
          notas: string | null
          resultado:
            | Database["public"]["Enums"]["cobranza_gestion_resultado"]
            | null
          tipo: Database["public"]["Enums"]["cobranza_gestion_tipo"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          factura_id?: string | null
          id?: string
          monto_comprometido?: number | null
          next_action_at?: string | null
          notas?: string | null
          resultado?:
            | Database["public"]["Enums"]["cobranza_gestion_resultado"]
            | null
          tipo?: Database["public"]["Enums"]["cobranza_gestion_tipo"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          factura_id?: string | null
          id?: string
          monto_comprometido?: number | null
          next_action_at?: string | null
          notas?: string | null
          resultado?:
            | Database["public"]["Enums"]["cobranza_gestion_resultado"]
            | null
          tipo?: Database["public"]["Enums"]["cobranza_gestion_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "cobranza_gestiones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      cobranza_promesas_pago: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          cumplida_at: string | null
          estado: Database["public"]["Enums"]["promesa_estado"]
          factura_id: string | null
          fecha_promesa: string
          gestion_id: string | null
          id: string
          monto: number
          monto_cumplido: number
          notas: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["promesa_estado"]
          factura_id?: string | null
          fecha_promesa: string
          gestion_id?: string | null
          id?: string
          monto: number
          monto_cumplido?: number
          notas?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          cumplida_at?: string | null
          estado?: Database["public"]["Enums"]["promesa_estado"]
          factura_id?: string | null
          fecha_promesa?: string
          gestion_id?: string | null
          id?: string
          monto?: number
          monto_cumplido?: number
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "cobranza_promesas_pago_gestion_id_fkey"
            columns: ["gestion_id"]
            isOneToOne: false
            referencedRelation: "cobranza_gestiones"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranza_templates: {
        Row: {
          activo: boolean
          asunto: string | null
          canal: string
          codigo: string
          created_at: string
          cuerpo: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          asunto?: string | null
          canal?: string
          codigo: string
          created_at?: string
          cuerpo: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          asunto?: string | null
          canal?: string
          codigo?: string
          created_at?: string
          cuerpo?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_migrations: {
        Row: {
          cliente_id: string
          competitor_name: string
          created_at: string
          created_by: string | null
          detected_at: string
          evidence_url: string | null
          id: string
          laboratorio_id: string | null
          motivo: string | null
          representante_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          competitor_name: string
          created_at?: string
          created_by?: string | null
          detected_at?: string
          evidence_url?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo?: string | null
          representante_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          competitor_name?: string
          created_at?: string
          created_by?: string | null
          detected_at?: string
          evidence_url?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo?: string | null
          representante_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "competitor_migrations_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "competitor_migrations_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_migrations_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "competitor_migrations_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "competitor_migrations_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "competitor_migrations_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_migrations_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      cost_history: {
        Row: {
          costo_anterior: number | null
          costo_unitario: number
          created_at: string
          fecha: string
          id: string
          laboratorio_id: string | null
          oc_id: string | null
          producto_id: string
          variacion_pct: number | null
        }
        Insert: {
          costo_anterior?: number | null
          costo_unitario: number
          created_at?: string
          fecha?: string
          id?: string
          laboratorio_id?: string | null
          oc_id?: string | null
          producto_id: string
          variacion_pct?: number | null
        }
        Update: {
          costo_anterior?: number | null
          costo_unitario?: number
          created_at?: string
          fecha?: string
          id?: string
          laboratorio_id?: string | null
          oc_id?: string | null
          producto_id?: string
          variacion_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "cost_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "cost_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "cost_history_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "cost_history_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "cost_history_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "cost_history_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      credito_autorizaciones: {
        Row: {
          cliente_id: string
          created_at: string
          dias: number | null
          estado: Database["public"]["Enums"]["autorizacion_estado"]
          factura_id: string | null
          id: string
          monto: number | null
          motivo: string
          pedido_id: string | null
          respuesta: string | null
          resuelto_at: string | null
          resuelto_por: string | null
          solicitado_at: string
          solicitado_por: string | null
          tipo: Database["public"]["Enums"]["autorizacion_tipo"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          dias?: number | null
          estado?: Database["public"]["Enums"]["autorizacion_estado"]
          factura_id?: string | null
          id?: string
          monto?: number | null
          motivo: string
          pedido_id?: string | null
          respuesta?: string | null
          resuelto_at?: string | null
          resuelto_por?: string | null
          solicitado_at?: string
          solicitado_por?: string | null
          tipo: Database["public"]["Enums"]["autorizacion_tipo"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          dias?: number | null
          estado?: Database["public"]["Enums"]["autorizacion_estado"]
          factura_id?: string | null
          id?: string
          monto?: number | null
          motivo?: string
          pedido_id?: string | null
          respuesta?: string | null
          resuelto_at?: string | null
          resuelto_por?: string | null
          solicitado_at?: string
          solicitado_por?: string | null
          tipo?: Database["public"]["Enums"]["autorizacion_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "credito_autorizaciones_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cuentas_contables: {
        Row: {
          activa: boolean
          codigo: string
          codigo_agrupador: string | null
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          moneda: string
          naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
          nivel: number
          nombre: string
          padre_id: string | null
          permite_movimientos: boolean
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          codigo_agrupador?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          moneda?: string
          naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
          nivel: number
          nombre: string
          padre_id?: string | null
          permite_movimientos?: boolean
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          codigo_agrupador?: string | null
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          moneda?: string
          naturaleza?: Database["public"]["Enums"]["cta_naturaleza"]
          nivel?: number
          nombre?: string
          padre_id?: string | null
          permite_movimientos?: boolean
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_contables_codigo_agrupador_fkey"
            columns: ["codigo_agrupador"]
            isOneToOne: false
            referencedRelation: "sat_codigo_agrupador"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "cuentas_contables_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_contables_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      damaged_batches: {
        Row: {
          bonificacion_pct: number | null
          condition: string | null
          cost_at_time: number | null
          cost_with_iva: number | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          id: string
          margin_pct: number | null
          notes: string | null
          order_id: string | null
          original_quantity: number
          photos: string[] | null
          product_id: string | null
          reason: string | null
          remaining_quantity: number
          source: string | null
          source_order_id: string | null
          status: string
          stock_adjustment: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          bonificacion_pct?: number | null
          condition?: string | null
          cost_at_time?: number | null
          cost_with_iva?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          margin_pct?: number | null
          notes?: string | null
          order_id?: string | null
          original_quantity?: number
          photos?: string[] | null
          product_id?: string | null
          reason?: string | null
          remaining_quantity?: number
          source?: string | null
          source_order_id?: string | null
          status?: string
          stock_adjustment?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          bonificacion_pct?: number | null
          condition?: string | null
          cost_at_time?: number | null
          cost_with_iva?: number | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          margin_pct?: number | null
          notes?: string | null
          order_id?: string | null
          original_quantity?: number
          photos?: string[] | null
          product_id?: string | null
          reason?: string | null
          remaining_quantity?: number
          source?: string | null
          source_order_id?: string | null
          status?: string
          stock_adjustment?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "damaged_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      delivery_reveal_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          order_id: string | null
          storage_path: string
          taken_at: string
          trip_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          storage_path: string
          taken_at?: string
          trip_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          storage_path?: string
          taken_at?: string
          trip_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_reveal_photos_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "delivery_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_trip_items: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          product_id: string | null
          quantity: number
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "delivery_trip_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "delivery_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_trips: {
        Row: {
          created_at: string
          id: string
          month: string | null
          notes: string | null
          staff_cost: number | null
          status: string
          trip_date: string
          truck_capacity_bultos: number | null
          truck_cost: number | null
          truck_provider: string | null
          truck_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month?: string | null
          notes?: string | null
          staff_cost?: number | null
          status?: string
          trip_date?: string
          truck_capacity_bultos?: number | null
          truck_cost?: number | null
          truck_provider?: string | null
          truck_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month?: string | null
          notes?: string | null
          staff_cost?: number | null
          status?: string
          trip_date?: string
          truck_capacity_bultos?: number | null
          truck_cost?: number | null
          truck_provider?: string | null
          truck_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      devolucion_items: {
        Row: {
          cantidad: number
          devolucion_id: string
          factura_item_id: string | null
          id: string
          importe: number | null
          iva_pct: number
          nombre_snapshot: string
          precio_unitario: number
          producto_id: string | null
          reingreso_stock: boolean
        }
        Insert: {
          cantidad: number
          devolucion_id: string
          factura_item_id?: string | null
          id?: string
          importe?: number | null
          iva_pct?: number
          nombre_snapshot: string
          precio_unitario: number
          producto_id?: string | null
          reingreso_stock?: boolean
        }
        Update: {
          cantidad?: number
          devolucion_id?: string
          factura_item_id?: string | null
          id?: string
          importe?: number | null
          iva_pct?: number
          nombre_snapshot?: string
          precio_unitario?: number
          producto_id?: string | null
          reingreso_stock?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "devolucion_items_factura_item_id_fkey"
            columns: ["factura_item_id"]
            isOneToOne: false
            referencedRelation: "factura_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "devolucion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          almacen_id: string
          cliente_id: string
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["devolucion_estado"]
          factura_id: string
          fecha: string
          folio: string | null
          id: string
          iva: number
          motivo: string | null
          notas: string | null
          poliza_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          almacen_id: string
          cliente_id: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          factura_id: string
          fecha?: string
          folio?: string | null
          id?: string
          iva?: number
          motivo?: string | null
          notas?: string | null
          poliza_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["devolucion_estado"]
          factura_id?: string
          fecha?: string
          folio?: string | null
          id?: string
          iva?: number
          motivo?: string | null
          notas?: string | null
          poliza_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "devoluciones_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      ejercicios_fiscales: {
        Row: {
          anio: number
          cerrado: boolean
          created_at: string
          empresa_id: string
          fecha_cierre: string | null
          id: string
        }
        Insert: {
          anio: number
          cerrado?: boolean
          created_at?: string
          empresa_id: string
          fecha_cierre?: string | null
          id?: string
        }
        Update: {
          anio?: number
          cerrado?: boolean
          created_at?: string
          empresa_id?: string
          fecha_cierre?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ejercicios_fiscales_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_amount: number
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_frequency: string | null
          payment_method: string | null
          role: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_frequency?: string | null
          payment_method?: string | null
          role?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_frequency?: string | null
          payment_method?: string | null
          role?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      empresa_csd: {
        Row: {
          cer_path: string
          cer_pem: string
          created_at: string
          empresa_id: string
          id: string
          is_active: boolean
          key_path: string
          no_certificado: string
          rfc: string
          tipo: string
          updated_at: string
          uploaded_by: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          cer_path: string
          cer_pem: string
          created_at?: string
          empresa_id: string
          id?: string
          is_active?: boolean
          key_path: string
          no_certificado: string
          rfc: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          cer_path?: string
          cer_pem?: string
          created_at?: string
          empresa_id?: string
          id?: string
          is_active?: boolean
          key_path?: string
          no_certificado?: string
          rfc?: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_csd_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_csd_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      empresa_datos: {
        Row: {
          cp_fiscal: string | null
          direccion_fiscal: string | null
          email_contacto: string | null
          id: number
          iva_default: number | null
          moneda_default: string | null
          netsuite_account_id: string | null
          netsuite_consumer_key_ref: string | null
          netsuite_token_ref: string | null
          razon_social: string | null
          regimen_fiscal: string | null
          representante_legal: string | null
          resend_api_key_ref: string | null
          resend_from_email: string | null
          rfc: string | null
          sitio_web: string | null
          telefono: string | null
          twilio_account_sid: string | null
          twilio_auth_token_ref: string | null
          twilio_from_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cp_fiscal?: string | null
          direccion_fiscal?: string | null
          email_contacto?: string | null
          id?: number
          iva_default?: number | null
          moneda_default?: string | null
          netsuite_account_id?: string | null
          netsuite_consumer_key_ref?: string | null
          netsuite_token_ref?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          representante_legal?: string | null
          resend_api_key_ref?: string | null
          resend_from_email?: string | null
          rfc?: string | null
          sitio_web?: string | null
          telefono?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token_ref?: string | null
          twilio_from_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cp_fiscal?: string | null
          direccion_fiscal?: string | null
          email_contacto?: string | null
          id?: number
          iva_default?: number | null
          moneda_default?: string | null
          netsuite_account_id?: string | null
          netsuite_consumer_key_ref?: string | null
          netsuite_token_ref?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          representante_legal?: string | null
          resend_api_key_ref?: string | null
          resend_from_email?: string | null
          rfc?: string | null
          sitio_web?: string | null
          telefono?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token_ref?: string | null
          twilio_from_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_datos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      empresa_documentos: {
        Row: {
          ai_analyzed: boolean
          categoria: string
          created_at: string
          empresa_id: string
          etiquetas: string[]
          filename: string
          id: string
          mime: string | null
          notas: string | null
          resumen: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_analyzed?: boolean
          categoria?: string
          created_at?: string
          empresa_id: string
          etiquetas?: string[]
          filename: string
          id?: string
          mime?: string | null
          notas?: string | null
          resumen?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_analyzed?: boolean
          categoria?: string
          created_at?: string
          empresa_id?: string
          etiquetas?: string[]
          filename?: string
          id?: string
          mime?: string | null
          notas?: string | null
          resumen?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empresa_documentos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      empresas: {
        Row: {
          active: boolean
          cp_fiscal: string | null
          created_at: string
          direccion_fiscal: string | null
          email_contacto: string | null
          folio_next: number
          id: string
          is_default: boolean
          iva_default: number
          logo_url: string | null
          lugar_expedicion: string | null
          moneda_default: string
          nombre_comercial: string | null
          razon_social: string
          regimen_fiscal: string | null
          representante_legal: string | null
          rfc: string
          serie_factura_default: string | null
          sitio_web: string | null
          telefono: string | null
          updated_at: string
          updated_by: string | null
          uso_cfdi_default: string | null
        }
        Insert: {
          active?: boolean
          cp_fiscal?: string | null
          created_at?: string
          direccion_fiscal?: string | null
          email_contacto?: string | null
          folio_next?: number
          id?: string
          is_default?: boolean
          iva_default?: number
          logo_url?: string | null
          lugar_expedicion?: string | null
          moneda_default?: string
          nombre_comercial?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc: string
          serie_factura_default?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
          updated_by?: string | null
          uso_cfdi_default?: string | null
        }
        Update: {
          active?: boolean
          cp_fiscal?: string | null
          created_at?: string
          direccion_fiscal?: string | null
          email_contacto?: string | null
          folio_next?: number
          id?: string
          is_default?: boolean
          iva_default?: number
          logo_url?: string | null
          lugar_expedicion?: string | null
          moneda_default?: string
          nombre_comercial?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc?: string
          serie_factura_default?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
          updated_by?: string | null
          uso_cfdi_default?: string | null
        }
        Relationships: []
      }
      entradas_recepcion: {
        Row: {
          almacen_id: string
          created_at: string
          created_by: string | null
          estado: string
          factura_proveedor: string | null
          fecha: string
          folio: string | null
          id: string
          notas: string | null
          oc_id: string | null
          proveedor: string | null
          updated_at: string
        }
        Insert: {
          almacen_id: string
          created_at?: string
          created_by?: string | null
          estado?: string
          factura_proveedor?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          oc_id?: string | null
          proveedor?: string | null
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          created_at?: string
          created_by?: string | null
          estado?: string
          factura_proveedor?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          oc_id?: string | null
          proveedor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_recepcion_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
        ]
      }
      entradas_recepcion_items: {
        Row: {
          caducidad: string | null
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          lote: string | null
          notas: string | null
          oc_item_id: string | null
          producto_id: string
          recepcion_id: string
        }
        Insert: {
          caducidad?: string | null
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          lote?: string | null
          notas?: string | null
          oc_item_id?: string | null
          producto_id: string
          recepcion_id: string
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          lote?: string | null
          notas?: string | null
          oc_item_id?: string | null
          producto_id?: string
          recepcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_recepcion_items_oc_item_id_fkey"
            columns: ["oc_item_id"]
            isOneToOne: false
            referencedRelation: "oc_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "entradas_recepcion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["recepcion_id"]
          },
          {
            foreignKeyName: "entradas_recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      factura_items: {
        Row: {
          cantidad: number
          factura_id: string
          id: string
          ieps_pct: number
          importe: number | null
          iva_pct: number
          nombre_snapshot: string
          precio_unitario: number
          producto_id: string | null
          sku_snapshot: string | null
          unidad_snapshot: string
        }
        Insert: {
          cantidad: number
          factura_id: string
          id?: string
          ieps_pct?: number
          importe?: number | null
          iva_pct?: number
          nombre_snapshot: string
          precio_unitario: number
          producto_id?: string | null
          sku_snapshot?: string | null
          unidad_snapshot?: string
        }
        Update: {
          cantidad?: number
          factura_id?: string
          id?: string
          ieps_pct?: number
          importe?: number | null
          iva_pct?: number
          nombre_snapshot?: string
          precio_unitario?: number
          producto_id?: string | null
          sku_snapshot?: string | null
          unidad_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      facturas: {
        Row: {
          backfill_source: string | null
          cancel_motivo: string | null
          canceled_at: string | null
          cfdi_status: string | null
          cfdi_use: string | null
          cliente_id: string
          created_at: string
          empresa_id: string | null
          estado: Database["public"]["Enums"]["factura_estado"]
          facturapi_id: string | null
          fecha_emision: string
          fecha_vencimiento: string
          folio: string
          id: string
          iva: number
          notas: string | null
          pagado: number
          payment_form: string | null
          payment_method: string | null
          pdf_url: string | null
          pedido_id: string | null
          poliza_id: string | null
          representante_id: string | null
          saldo: number | null
          serie: string | null
          subtotal: number
          total: number
          updated_at: string
          uuid_fiscal: string | null
          xml_url: string | null
        }
        Insert: {
          backfill_source?: string | null
          cancel_motivo?: string | null
          canceled_at?: string | null
          cfdi_status?: string | null
          cfdi_use?: string | null
          cliente_id: string
          created_at?: string
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["factura_estado"]
          facturapi_id?: string | null
          fecha_emision?: string
          fecha_vencimiento?: string
          folio?: string
          id?: string
          iva?: number
          notas?: string | null
          pagado?: number
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          pedido_id?: string | null
          poliza_id?: string | null
          representante_id?: string | null
          saldo?: number | null
          serie?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          uuid_fiscal?: string | null
          xml_url?: string | null
        }
        Update: {
          backfill_source?: string | null
          cancel_motivo?: string | null
          canceled_at?: string | null
          cfdi_status?: string | null
          cfdi_use?: string | null
          cliente_id?: string
          created_at?: string
          empresa_id?: string | null
          estado?: Database["public"]["Enums"]["factura_estado"]
          facturapi_id?: string | null
          fecha_emision?: string
          fecha_vencimiento?: string
          folio?: string
          id?: string
          iva?: number
          notas?: string | null
          pagado?: number
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          pedido_id?: string | null
          poliza_id?: string | null
          representante_id?: string | null
          saldo?: number | null
          serie?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          uuid_fiscal?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "facturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "facturas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "facturas_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      fixed_expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          expense_date: string | null
          frequency: string | null
          id: string
          is_recurring: boolean | null
          month: string | null
          name: string
          notes: string | null
          payment_method: string | null
          subcategory: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          expense_date?: string | null
          frequency?: string | null
          id?: string
          is_recurring?: boolean | null
          month?: string | null
          name: string
          notes?: string | null
          payment_method?: string | null
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          expense_date?: string | null
          frequency?: string | null
          id?: string
          is_recurring?: boolean | null
          month?: string | null
          name?: string
          notes?: string | null
          payment_method?: string | null
          subcategory?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      kanban_boards: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: []
      }
      kanban_cards: {
        Row: {
          assigned_name: string | null
          assigned_to: string | null
          column_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_name?: string | null
          assigned_to?: string | null
          column_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_name?: string | null
          assigned_to?: string | null
          column_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_comments: {
        Row: {
          card_id: string
          created_at: string
          id: string
          text: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          text: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kanban_comments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "kanban_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      laboratorios: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          id_fiscal_extranjero: string | null
          logo_url: string | null
          nacionalidad: string | null
          nombre: string
          orden: number
          pais: string | null
          rfc: string | null
          tipo_operacion: string
          tipo_tercero: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          id_fiscal_extranjero?: string | null
          logo_url?: string | null
          nacionalidad?: string | null
          nombre: string
          orden?: number
          pais?: string | null
          rfc?: string | null
          tipo_operacion?: string
          tipo_tercero?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          id_fiscal_extranjero?: string | null
          logo_url?: string | null
          nacionalidad?: string | null
          nombre?: string
          orden?: number
          pais?: string | null
          rfc?: string | null
          tipo_operacion?: string
          tipo_tercero?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_last_seen: {
        Row: {
          id: string
          last_checked_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_checked_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_checked_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      maniobra_count_events: {
        Row: {
          action: string | null
          actor_id: string | null
          actor_label: string | null
          created_at: string
          delta: number
          id: string
          line_key: string | null
          plan_date: string
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          delta?: number
          id?: string
          line_key?: string | null
          plan_date: string
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          delta?: number
          id?: string
          line_key?: string | null
          plan_date?: string
        }
        Relationships: []
      }
      maniobra_pins: {
        Row: {
          display_name: string | null
          pin_hash: string | null
          role: string
          updated_at: string
        }
        Insert: {
          display_name?: string | null
          pin_hash?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          pin_hash?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      maniobra_plans: {
        Row: {
          created_at: string
          id: string
          pickup_order_ids: Json
          plan_date: string
          trucks: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pickup_order_ids?: Json
          plan_date: string
          trucks?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pickup_order_ids?: Json
          plan_date?: string
          trucks?: Json
          updated_at?: string
        }
        Relationships: []
      }
      margins: {
        Row: {
          bonificacion_pct: number | null
          cost_with_iva: number | null
          cost_without_iva: number | null
          created_at: string
          id: string
          margin_pct: number | null
          notes: string | null
          product_id: string | null
          updated_at: string
        }
        Insert: {
          bonificacion_pct?: number | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          id?: string
          margin_pct?: number | null
          notes?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          bonificacion_pct?: number | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          id?: string
          margin_pct?: number | null
          notes?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body_html: string | null
          body_text: string | null
          category: string
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          key: string
          name: string
          subject: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key: string
          name: string
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          key?: string
          name?: string
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      monthly_bonificaciones: {
        Row: {
          created_at: string
          gdl_amount: number | null
          gdl_settled_at: string | null
          id: string
          naucalpan_amount: number | null
          notes: string | null
          period_month: string
          proof_path: string | null
          tamemes_amount: number | null
          tamemes_settled_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gdl_amount?: number | null
          gdl_settled_at?: string | null
          id?: string
          naucalpan_amount?: number | null
          notes?: string | null
          period_month: string
          proof_path?: string | null
          tamemes_amount?: number | null
          tamemes_settled_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gdl_amount?: number | null
          gdl_settled_at?: string | null
          id?: string
          naucalpan_amount?: number | null
          notes?: string | null
          period_month?: string
          proof_path?: string | null
          tamemes_amount?: number | null
          tamemes_settled_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      movimientos_inventario: {
        Row: {
          almacen_id: string
          caducidad: string | null
          cantidad: number
          created_at: string
          created_by: string | null
          id: string
          lote: string | null
          notas: string | null
          origen_id: string | null
          origen_tipo: string | null
          pedido_id: string | null
          producto_id: string
          referencia: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Insert: {
          almacen_id: string
          caducidad?: string | null
          cantidad: number
          created_at?: string
          created_by?: string | null
          id?: string
          lote?: string | null
          notas?: string | null
          origen_id?: string | null
          origen_tipo?: string | null
          pedido_id?: string | null
          producto_id: string
          referencia?: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Update: {
          almacen_id?: string
          caducidad?: string | null
          cantidad?: number
          created_at?: string
          created_by?: string | null
          id?: string
          lote?: string | null
          notas?: string | null
          origen_id?: string | null
          origen_tipo?: string | null
          pedido_id?: string | null
          producto_id?: string
          referencia?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      notas_credito: {
        Row: {
          created_at: string
          devolucion_id: string | null
          factura_id: string
          fecha: string
          folio: string | null
          id: string
          notas: string | null
          total: number
        }
        Insert: {
          created_at?: string
          devolucion_id?: string | null
          factura_id: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          total: number
        }
        Update: {
          created_at?: string
          devolucion_id?: string | null
          factura_id?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_credito_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["devolucion_id"]
          },
          {
            foreignKeyName: "notas_credito_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "notas_credito_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      notas_credito_proveedor: {
        Row: {
          created_at: string
          created_by: string | null
          factura_proveedor: string | null
          fecha: string
          folio: string | null
          id: string
          laboratorio_id: string | null
          motivo: string | null
          notas: string | null
          oc_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          factura_proveedor?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo?: string | null
          notas?: string | null
          oc_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          factura_proveedor?: string | null
          fecha?: string
          folio?: string | null
          id?: string
          laboratorio_id?: string | null
          motivo?: string | null
          notas?: string | null
          oc_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_credito_proveedor_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
        ]
      }
      notas_credito_proveedor_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          id: string
          importe: number
          lote: string | null
          nc_id: string
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          importe?: number
          lote?: string | null
          nc_id: string
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          id?: string
          importe?: number
          lote?: string | null
          nc_id?: string
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_credito_proveedor_items_nc_id_fkey"
            columns: ["nc_id"]
            isOneToOne: false
            referencedRelation: "notas_credito_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_nc_id_fkey"
            columns: ["nc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["nc_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          notification_id: string | null
          sent_at: string | null
          status: string
          target: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          email: boolean
          id: string
          in_app: boolean
          sms: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          sms?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          sms?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string | null
          channel_status: Json
          created_at: string
          description: string | null
          emailed_at: string | null
          entity_id: string | null
          id: string
          priority: string | null
          read_at: string | null
          route: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          channel_status?: Json
          created_at?: string
          description?: string | null
          emailed_at?: string | null
          entity_id?: string | null
          id?: string
          priority?: string | null
          read_at?: string | null
          route?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          channel_status?: Json
          created_at?: string
          description?: string | null
          emailed_at?: string | null
          entity_id?: string | null
          id?: string
          priority?: string | null
          read_at?: string | null
          route?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      oc_items: {
        Row: {
          cantidad: number
          cantidad_recibida: number
          costo_unitario: number
          id: string
          oc_id: string
          producto_id: string
          subtotal: number | null
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number
          costo_unitario?: number
          id?: string
          oc_id: string
          producto_id: string
          subtotal?: number | null
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number
          costo_unitario?: number
          id?: string
          oc_id?: string
          producto_id?: string
          subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "oc_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      onboarding_archivos: {
        Row: {
          id: string
          item_id: string
          mime_type: string | null
          nombre_original: string
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          id?: string
          item_id: string
          mime_type?: string | null
          nombre_original: string
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          mime_type?: string | null
          nombre_original?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_archivos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "onboarding_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_archivos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      onboarding_items: {
        Row: {
          categoria: Database["public"]["Enums"]["onboarding_categoria"]
          clave: string
          descripcion: string | null
          estado: Database["public"]["Enums"]["onboarding_estado"]
          id: string
          notas: string | null
          orden: number
          requerido: boolean
          requiere_archivo: boolean
          titulo: string
          updated_at: string
          updated_by: string | null
          valor_texto: string | null
        }
        Insert: {
          categoria: Database["public"]["Enums"]["onboarding_categoria"]
          clave: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["onboarding_estado"]
          id?: string
          notas?: string | null
          orden?: number
          requerido?: boolean
          requiere_archivo?: boolean
          titulo: string
          updated_at?: string
          updated_by?: string | null
          valor_texto?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["onboarding_categoria"]
          clave?: string
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["onboarding_estado"]
          id?: string
          notas?: string | null
          orden?: number
          requerido?: boolean
          requiere_archivo?: boolean
          titulo?: string
          updated_at?: string
          updated_by?: string | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          almacen_id: string
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["oc_estado"]
          factura_proveedor: string | null
          factura_proveedor_fecha: string | null
          fecha_emision: string
          fecha_esperada: string | null
          fecha_recepcion: string | null
          folio: string | null
          id: string
          iva: number
          laboratorio_id: string
          notas: string | null
          poliza_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          almacen_id: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["oc_estado"]
          factura_proveedor?: string | null
          factura_proveedor_fecha?: string | null
          fecha_emision?: string
          fecha_esperada?: string | null
          fecha_recepcion?: string | null
          folio?: string | null
          id?: string
          iva?: number
          laboratorio_id: string
          notas?: string | null
          poliza_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["oc_estado"]
          factura_proveedor?: string | null
          factura_proveedor_fecha?: string | null
          fecha_emision?: string
          fecha_esperada?: string | null
          fecha_recepcion?: string | null
          folio?: string | null
          id?: string
          iva?: number
          laboratorio_id?: string
          notas?: string | null
          poliza_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "ordenes_compra_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ordenes_compra_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "ordenes_compra_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "ordenes_compra_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "ordenes_compra_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      order_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          credit_amount: number
          damaged_batch_id: string | null
          faltante_destino: string | null
          id: string
          notes: string | null
          order_id: string
          order_item_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          tipo: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          damaged_batch_id?: string | null
          faltante_destino?: string | null
          id?: string
          notes?: string | null
          order_id: string
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          tipo?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number
          damaged_batch_id?: string | null
          faltante_destino?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          tipo?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_adjustments_damaged_batch_id_fkey"
            columns: ["damaged_batch_id"]
            isOneToOne: false
            referencedRelation: "damaged_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "order_adjustments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v_order_item_breakdown"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "order_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      order_changes: {
        Row: {
          created_at: string
          created_by: string | null
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          operation: string | null
          order_id: string | null
          summary: string | null
          table_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          operation?: string | null
          order_id?: string | null
          summary?: string | null
          table_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          operation?: string | null
          order_id?: string | null
          summary?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      order_documents: {
        Row: {
          category: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          order_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          order_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      order_stop_items: {
        Row: {
          id: string
          order_item_id: string
          quantity: number
          stop_id: string
        }
        Insert: {
          id?: string
          order_item_id: string
          quantity?: number
          stop_id: string
        }
        Update: {
          id?: string
          order_item_id?: string
          quantity?: number
          stop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_stop_items_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "order_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      order_stops: {
        Row: {
          address: string | null
          client_label: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          manual_maps_url: string | null
          notes: string | null
          order_id: string
          signature_path: string | null
          signed_at: string | null
          signed_by_name: string | null
          stop_index: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_label?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          manual_maps_url?: string | null
          notes?: string | null
          order_id: string
          signature_path?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          stop_index?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_label?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          manual_maps_url?: string | null
          notes?: string | null
          order_id?: string
          signature_path?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          stop_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      pagos: {
        Row: {
          complemento_error: string | null
          complemento_estado: string | null
          complemento_facturapi_id: string | null
          complemento_pdf_url: string | null
          complemento_timbrado_at: string | null
          complemento_uuid: string | null
          complemento_xml_url: string | null
          created_at: string
          created_by: string | null
          factura_id: string
          fecha: string
          id: string
          metodo: Database["public"]["Enums"]["pago_metodo"]
          monto: number
          notas: string | null
          poliza_id: string | null
          referencia: string | null
        }
        Insert: {
          complemento_error?: string | null
          complemento_estado?: string | null
          complemento_facturapi_id?: string | null
          complemento_pdf_url?: string | null
          complemento_timbrado_at?: string | null
          complemento_uuid?: string | null
          complemento_xml_url?: string | null
          created_at?: string
          created_by?: string | null
          factura_id: string
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["pago_metodo"]
          monto: number
          notas?: string | null
          poliza_id?: string | null
          referencia?: string | null
        }
        Update: {
          complemento_error?: string | null
          complemento_estado?: string | null
          complemento_facturapi_id?: string | null
          complemento_pdf_url?: string | null
          complemento_timbrado_at?: string | null
          complemento_uuid?: string | null
          complemento_xml_url?: string | null
          created_at?: string
          created_by?: string | null
          factura_id?: string
          fecha?: string
          id?: string
          metodo?: Database["public"]["Enums"]["pago_metodo"]
          monto?: number
          notas?: string | null
          poliza_id?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "pagos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "pagos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "pagos_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_monthly_settlements: {
        Row: {
          cost_basis: number | null
          created_at: string
          gross_profit: number | null
          id: string
          notes: string | null
          our_share: number | null
          partner_id: string
          partner_share: number | null
          period_month: string
          proof_path: string | null
          reported_revenue: number | null
          settled_at: string | null
          updated_at: string
        }
        Insert: {
          cost_basis?: number | null
          created_at?: string
          gross_profit?: number | null
          id?: string
          notes?: string | null
          our_share?: number | null
          partner_id: string
          partner_share?: number | null
          period_month: string
          proof_path?: string | null
          reported_revenue?: number | null
          settled_at?: string | null
          updated_at?: string
        }
        Update: {
          cost_basis?: number | null
          created_at?: string
          gross_profit?: number | null
          id?: string
          notes?: string | null
          our_share?: number | null
          partner_id?: string
          partner_share?: number | null
          period_month?: string
          proof_path?: string | null
          reported_revenue?: number | null
          settled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_monthly_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_shipment_items: {
        Row: {
          clave: string | null
          cost_with_iva: number | null
          cost_without_iva: number | null
          created_at: string
          description: string | null
          id: string
          importe: number | null
          kilos: number | null
          product_id: string | null
          quantity: number
          shipment_id: string
        }
        Insert: {
          clave?: string | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          description?: string | null
          id?: string
          importe?: number | null
          kilos?: number | null
          product_id?: string | null
          quantity?: number
          shipment_id: string
        }
        Update: {
          clave?: string | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          description?: string | null
          id?: string
          importe?: number | null
          kilos?: number | null
          product_id?: string | null
          quantity?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "partner_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_shipments: {
        Row: {
          adm_proof_path: string | null
          adm_total_cost: number | null
          charged_to_partner: number | null
          created_at: string
          id: string
          notes: string | null
          partner_id: string
          partner_paid_at: string | null
          payment_bank: string | null
          payment_method: string | null
          payment_proof_path: string | null
          payment_reference: string | null
          shipment_code: string | null
          shipment_date: string
          updated_at: string
        }
        Insert: {
          adm_proof_path?: string | null
          adm_total_cost?: number | null
          charged_to_partner?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          partner_id: string
          partner_paid_at?: string | null
          payment_bank?: string | null
          payment_method?: string | null
          payment_proof_path?: string | null
          payment_reference?: string | null
          shipment_code?: string | null
          shipment_date?: string
          updated_at?: string
        }
        Update: {
          adm_proof_path?: string | null
          adm_total_cost?: number | null
          charged_to_partner?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          partner_id?: string
          partner_paid_at?: string | null
          payment_bank?: string | null
          payment_method?: string | null
          payment_proof_path?: string | null
          payment_reference?: string | null
          shipment_code?: string | null
          shipment_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_shipments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_payments: {
        Row: {
          amount: number
          created_at: string
          days_worked: number | null
          employee_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_type: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          days_worked?: number | null
          employee_id: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          payment_type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          days_worked?: number | null
          employee_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          damaged_batch_id: string | null
          id: string
          importe: number | null
          is_damaged: boolean
          iva_pct: number
          nombre_snapshot: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
          sku_snapshot: string | null
          unidad_snapshot: string
        }
        Insert: {
          cantidad: number
          damaged_batch_id?: string | null
          id?: string
          importe?: number | null
          is_damaged?: boolean
          iva_pct?: number
          nombre_snapshot: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
          sku_snapshot?: string | null
          unidad_snapshot?: string
        }
        Update: {
          cantidad?: number
          damaged_batch_id?: string | null
          id?: string
          importe?: number | null
          is_damaged?: boolean
          iva_pct?: number
          nombre_snapshot?: string
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string
          sku_snapshot?: string | null
          unidad_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_damaged_batch_id_fkey"
            columns: ["damaged_batch_id"]
            isOneToOne: false
            referencedRelation: "damaged_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          backfill_source: string | null
          cliente_id: string
          comision_monto: number | null
          comision_pct: number | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          delivery_date: string | null
          discount_amount: number
          discount_reason: string | null
          estado: Database["public"]["Enums"]["pedido_estado"]
          folio: string
          fulfillment_method: string | null
          id: string
          iva: number
          needs_approval: boolean | null
          notas_cliente: string | null
          notas_internas: string | null
          order_code: string | null
          price_list_id: string | null
          representante_id: string | null
          signature_path: string | null
          signature_token: string | null
          signed_at: string | null
          signed_by_name: string | null
          subtotal: number
          total: number
          updated_at: string
          urgency: boolean | null
        }
        Insert: {
          backfill_source?: string | null
          cliente_id: string
          comision_monto?: number | null
          comision_pct?: number | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          delivery_date?: string | null
          discount_amount?: number
          discount_reason?: string | null
          estado?: Database["public"]["Enums"]["pedido_estado"]
          folio?: string
          fulfillment_method?: string | null
          id?: string
          iva?: number
          needs_approval?: boolean | null
          notas_cliente?: string | null
          notas_internas?: string | null
          order_code?: string | null
          price_list_id?: string | null
          representante_id?: string | null
          signature_path?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          urgency?: boolean | null
        }
        Update: {
          backfill_source?: string | null
          cliente_id?: string
          comision_monto?: number | null
          comision_pct?: number | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          delivery_date?: string | null
          discount_amount?: number
          discount_reason?: string | null
          estado?: Database["public"]["Enums"]["pedido_estado"]
          folio?: string
          fulfillment_method?: string | null
          id?: string
          iva?: number
          needs_approval?: boolean | null
          notas_cliente?: string | null
          notas_internas?: string | null
          order_code?: string | null
          price_list_id?: string | null
          representante_id?: string | null
          signature_path?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          urgency?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      periodos_contables: {
        Row: {
          anio: number
          ejercicio_id: string
          empresa_id: string
          estado: Database["public"]["Enums"]["periodo_estado"]
          fecha_envio: string | null
          id: string
          mes: number
        }
        Insert: {
          anio: number
          ejercicio_id: string
          empresa_id: string
          estado?: Database["public"]["Enums"]["periodo_estado"]
          fecha_envio?: string | null
          id?: string
          mes: number
        }
        Update: {
          anio?: number
          ejercicio_id?: string
          empresa_id?: string
          estado?: Database["public"]["Enums"]["periodo_estado"]
          fecha_envio?: string | null
          id?: string
          mes?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodos_contables_ejercicio_id_fkey"
            columns: ["ejercicio_id"]
            isOneToOne: false
            referencedRelation: "ejercicios_fiscales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodos_contables_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_routes: {
        Row: {
          active: boolean
          created_at: string
          group_label: string
          route_key: string
          route_path: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          group_label: string
          route_key: string
          route_path: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          group_label?: string
          route_key?: string
          route_path?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      poliza_impuestos: {
        Row: {
          base: number
          id: string
          monto: number
          notas: string | null
          poliza_id: string
          tasa: number
          tipo: Database["public"]["Enums"]["impuesto_tipo"]
          uuid_cfdi: string | null
        }
        Insert: {
          base?: number
          id?: string
          monto?: number
          notas?: string | null
          poliza_id: string
          tasa: number
          tipo: Database["public"]["Enums"]["impuesto_tipo"]
          uuid_cfdi?: string | null
        }
        Update: {
          base?: number
          id?: string
          monto?: number
          notas?: string | null
          poliza_id?: string
          tasa?: number
          tipo?: Database["public"]["Enums"]["impuesto_tipo"]
          uuid_cfdi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poliza_impuestos_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      poliza_movimientos: {
        Row: {
          abono: number
          cargo: number
          concepto: string | null
          cuenta_id: string
          devolucion_id: string | null
          factura_id: string | null
          id: string
          oc_id: string | null
          orden: number
          pago_id: string | null
          poliza_id: string
          uuid_cfdi: string | null
        }
        Insert: {
          abono?: number
          cargo?: number
          concepto?: string | null
          cuenta_id: string
          devolucion_id?: string | null
          factura_id?: string | null
          id?: string
          oc_id?: string | null
          orden?: number
          pago_id?: string | null
          poliza_id: string
          uuid_cfdi?: string | null
        }
        Update: {
          abono?: number
          cargo?: number
          concepto?: string | null
          cuenta_id?: string
          devolucion_id?: string | null
          factura_id?: string | null
          id?: string
          oc_id?: string | null
          orden?: number
          pago_id?: string | null
          poliza_id?: string
          uuid_cfdi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poliza_movimientos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poliza_movimientos_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      polizas: {
        Row: {
          cancelada_por: string | null
          concepto: string
          created_at: string
          created_by: string | null
          empresa_id: string
          estado: Database["public"]["Enums"]["poliza_estado"]
          estado_origen: string
          fecha: string
          folio: string
          id: string
          origen: string | null
          origen_id: string | null
          periodo_id: string | null
          posted_at: string | null
          posted_by: string | null
          tipo: Database["public"]["Enums"]["poliza_tipo"]
          total_abonos: number
          total_cargos: number
          updated_at: string
        }
        Insert: {
          cancelada_por?: string | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          estado?: Database["public"]["Enums"]["poliza_estado"]
          estado_origen?: string
          fecha?: string
          folio: string
          id?: string
          origen?: string | null
          origen_id?: string | null
          periodo_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          tipo: Database["public"]["Enums"]["poliza_tipo"]
          total_abonos?: number
          total_cargos?: number
          updated_at?: string
        }
        Update: {
          cancelada_por?: string | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          estado?: Database["public"]["Enums"]["poliza_estado"]
          estado_origen?: string
          fecha?: string
          folio?: string
          id?: string
          origen?: string | null
          origen_id?: string | null
          periodo_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          tipo?: Database["public"]["Enums"]["poliza_tipo"]
          total_abonos?: number
          total_cargos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polizas_cancelada_por_fkey"
            columns: ["cancelada_por"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polizas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polizas_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "periodos_contables"
            referencedColumns: ["id"]
          },
        ]
      }
      precios_cliente: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          precio: number
          producto_id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          precio: number
          producto_id: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          precio?: number
          producto_id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "precios_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "precios_cliente_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          created_at: string
          id: string
          manual_override: boolean
          price_list_id: string
          price_with_iva: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manual_override?: boolean
          price_list_id: string
          price_with_iva: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manual_override?: boolean
          price_list_id?: string
          price_with_iva?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      price_lists: {
        Row: {
          active: boolean
          created_at: string
          default_for_client_type: string | null
          description: string | null
          id: string
          markup_pct: number
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_for_client_type?: string | null
          description?: string | null
          id?: string
          markup_pct?: number
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_for_client_type?: string | null
          description?: string | null
          id?: string
          markup_pct?: number
          name?: string
        }
        Relationships: []
      }
      product_batches: {
        Row: {
          almacen_id: string
          caducidad: string | null
          cantidad: number
          costo_unitario: number | null
          created_at: string
          created_by: string | null
          id: string
          lote: string | null
          oc_id: string | null
          producto_id: string
          updated_at: string
        }
        Insert: {
          almacen_id: string
          caducidad?: string | null
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          lote?: string | null
          oc_id?: string | null
          producto_id: string
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          caducidad?: string | null
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          lote?: string | null
          oc_id?: string | null
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "product_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "product_batches_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "product_batches_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "product_batches_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      product_prices: {
        Row: {
          bonificacion_pct: number | null
          clave: string | null
          cost_with_iva: number | null
          cost_without_iva: number | null
          created_at: string
          id: string
          image_url: string | null
          price: number | null
          product_id: string | null
          product_name: string | null
          supplier: string | null
          updated_at: string
        }
        Insert: {
          bonificacion_pct?: number | null
          clave?: string | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          bonificacion_pct?: number | null
          clave?: string | null
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          price?: number | null
          product_id?: string | null
          product_name?: string | null
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_promotions: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          notes: string | null
          product_id: string | null
          promo_clave: string | null
          promo_cost_with_iva: number | null
          promo_cost_without_iva: number | null
          promo_name: string | null
          promo_weight_kg: number | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          promo_clave?: string | null
          promo_cost_with_iva?: number | null
          promo_cost_without_iva?: number | null
          promo_name?: string | null
          promo_weight_kg?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          promo_clave?: string | null
          promo_cost_with_iva?: number | null
          promo_cost_without_iva?: number | null
          promo_name?: string | null
          promo_weight_kg?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      product_stock_params: {
        Row: {
          bloqueo_compra: boolean
          bloqueo_motivo: string | null
          dias_cobertura_objetivo: number
          dias_seguridad: number
          lead_time_dias: number
          producto_id: string
          punto_reorden: number | null
          stock_max: number | null
          stock_min: number
          updated_at: string
        }
        Insert: {
          bloqueo_compra?: boolean
          bloqueo_motivo?: string | null
          dias_cobertura_objetivo?: number
          dias_seguridad?: number
          lead_time_dias?: number
          producto_id: string
          punto_reorden?: number | null
          stock_max?: number | null
          stock_min?: number
          updated_at?: string
        }
        Update: {
          bloqueo_compra?: boolean
          bloqueo_motivo?: string | null
          dias_cobertura_objetivo?: number
          dias_seguridad?: number
          lead_time_dias?: number
          producto_id?: string
          punto_reorden?: number | null
          stock_max?: number | null
          stock_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_stock_params_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      product_substitutes: {
        Row: {
          created_at: string
          id: string
          motivo: string | null
          prioridad: number
          producto_id: string
          sustituto_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          motivo?: string | null
          prioridad?: number
          producto_id: string
          sustituto_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string | null
          prioridad?: number
          producto_id?: string
          sustituto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_substitutes_sustituto_id_fkey"
            columns: ["sustituto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          bonificacion_pct: number | null
          categoria: string | null
          costo: number | null
          costo_civa: number | null
          costo_siva: number | null
          created_at: string
          descripcion: string | null
          especie: string[] | null
          facturapi_id: string | null
          grupo: string | null
          id: string
          ieps_pct: number
          imagen_url: string | null
          iva_pct: number
          laboratorio_id: string | null
          linea: string | null
          marca: string | null
          margen_bonif_pct: number | null
          margen_normal_pct: number | null
          nombre: string
          peso_kg: number | null
          precio_lista: number
          presentacion: string | null
          promo: boolean
          proveedor: string | null
          sat_clave: string | null
          sat_product_key: string | null
          sat_unit_key: string | null
          search_tsv: unknown
          sku: string | null
          stock_comprometido: number
          stock_disponible: number
          stock_en_camino: number
          stock_minimo: number
          tax_regime: string | null
          tipo_producto: string | null
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          bonificacion_pct?: number | null
          categoria?: string | null
          costo?: number | null
          costo_civa?: number | null
          costo_siva?: number | null
          created_at?: string
          descripcion?: string | null
          especie?: string[] | null
          facturapi_id?: string | null
          grupo?: string | null
          id?: string
          ieps_pct?: number
          imagen_url?: string | null
          iva_pct?: number
          laboratorio_id?: string | null
          linea?: string | null
          marca?: string | null
          margen_bonif_pct?: number | null
          margen_normal_pct?: number | null
          nombre: string
          peso_kg?: number | null
          precio_lista?: number
          presentacion?: string | null
          promo?: boolean
          proveedor?: string | null
          sat_clave?: string | null
          sat_product_key?: string | null
          sat_unit_key?: string | null
          search_tsv?: unknown
          sku?: string | null
          stock_comprometido?: number
          stock_disponible?: number
          stock_en_camino?: number
          stock_minimo?: number
          tax_regime?: string | null
          tipo_producto?: string | null
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          bonificacion_pct?: number | null
          categoria?: string | null
          costo?: number | null
          costo_civa?: number | null
          costo_siva?: number | null
          created_at?: string
          descripcion?: string | null
          especie?: string[] | null
          facturapi_id?: string | null
          grupo?: string | null
          id?: string
          ieps_pct?: number
          imagen_url?: string | null
          iva_pct?: number
          laboratorio_id?: string | null
          linea?: string | null
          marca?: string | null
          margen_bonif_pct?: number | null
          margen_normal_pct?: number | null
          nombre?: string
          peso_kg?: number | null
          precio_lista?: number
          presentacion?: string | null
          promo?: boolean
          proveedor?: string | null
          sat_clave?: string | null
          sat_product_key?: string | null
          sat_unit_key?: string | null
          search_tsv?: unknown
          sku?: string | null
          stock_comprometido?: number
          stock_disponible?: number
          stock_en_camino?: number
          stock_minimo?: number
          tax_regime?: string | null
          tipo_producto?: string | null
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      prospect_calls: {
        Row: {
          called_at: string
          created_at: string
          created_by: string | null
          id: string
          next_action_at: string | null
          notes: string | null
          outcome: string | null
          prospect_id: string
        }
        Insert: {
          called_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          next_action_at?: string | null
          notes?: string | null
          outcome?: string | null
          prospect_id: string
        }
        Update: {
          called_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          next_action_at?: string | null
          notes?: string | null
          outcome?: string | null
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_calls_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          assigned_to: string | null
          business_status: string | null
          colonia: string | null
          contact_person: string | null
          converted_client_id: string | null
          created_at: string
          description: string | null
          direccion: string | null
          enriched_at: string | null
          enrichment_status: string | null
          google_maps_url: string | null
          id: string
          lat: number | null
          lng: number | null
          manual_maps_url: string | null
          municipio: string | null
          name: string | null
          notes: string | null
          opening_hours: Json | null
          phone: string | null
          photo_url: string | null
          place_id: string | null
          price_level: string | null
          primary_type: string | null
          rating: number | null
          review_count: number | null
          source: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_status?: string | null
          colonia?: string | null
          contact_person?: string | null
          converted_client_id?: string | null
          created_at?: string
          description?: string | null
          direccion?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          google_maps_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          manual_maps_url?: string | null
          municipio?: string | null
          name?: string | null
          notes?: string | null
          opening_hours?: Json | null
          phone?: string | null
          photo_url?: string | null
          place_id?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          review_count?: number | null
          source?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_status?: string | null
          colonia?: string | null
          contact_person?: string | null
          converted_client_id?: string | null
          created_at?: string
          description?: string | null
          direccion?: string | null
          enriched_at?: string | null
          enrichment_status?: string | null
          google_maps_url?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          manual_maps_url?: string | null
          municipio?: string | null
          name?: string | null
          notes?: string | null
          opening_hours?: Json | null
          phone?: string | null
          photo_url?: string | null
          place_id?: string | null
          price_level?: string | null
          primary_type?: string | null
          rating?: number | null
          review_count?: number | null
          source?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      purchase_alerts: {
        Row: {
          created_at: string
          detalle: string | null
          id: string
          laboratorio_id: string | null
          oc_id: string | null
          payload: Json | null
          prioridad: string | null
          producto_id: string | null
          responsable_user_id: string | null
          resuelto: boolean
          resuelto_at: string | null
          resuelto_por: string | null
          severidad: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          detalle?: string | null
          id?: string
          laboratorio_id?: string | null
          oc_id?: string | null
          payload?: Json | null
          prioridad?: string | null
          producto_id?: string | null
          responsable_user_id?: string | null
          resuelto?: boolean
          resuelto_at?: string | null
          resuelto_por?: string | null
          severidad?: string
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          detalle?: string | null
          id?: string
          laboratorio_id?: string | null
          oc_id?: string | null
          payload?: Json | null
          prioridad?: string | null
          producto_id?: string | null
          responsable_user_id?: string | null
          resuelto?: boolean
          resuelto_at?: string | null
          resuelto_por?: string | null
          severidad?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_alerts_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "purchase_alerts_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "purchase_alerts_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "purchase_alerts_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "purchase_alerts_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "purchase_alerts_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "purchase_alerts_responsable_user_id_fkey"
            columns: ["responsable_user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_alerts_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      purchase_budgets: {
        Row: {
          created_at: string
          created_by: string | null
          empresa_id: string | null
          id: string
          mes: string
          monto_mxn: number
          notas: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          mes: string
          monto_mxn?: number
          notas?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          mes?: string
          monto_mxn?: number
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_budgets_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_config: {
        Row: {
          clave: string
          updated_at: string
          valor: Json
        }
        Insert: {
          clave: string
          updated_at?: string
          valor: Json
        }
        Update: {
          clave?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string | null
          quantity: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quote_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          quote_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_to_order_id: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          payment_method: string | null
          price_list_id: string | null
          shipping_address: string | null
          source: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_to_order_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          price_list_id?: string | null
          shipping_address?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_to_order_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          price_list_id?: string | null
          shipping_address?: string | null
          source?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      remision_items: {
        Row: {
          caducidad: string | null
          cantidad: number
          created_at: string
          id: string
          lote: string | null
          pedido_item_id: string | null
          producto_id: string
          remision_id: string
          ubicacion: string | null
        }
        Insert: {
          caducidad?: string | null
          cantidad: number
          created_at?: string
          id?: string
          lote?: string | null
          pedido_item_id?: string | null
          producto_id: string
          remision_id: string
          ubicacion?: string | null
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          created_at?: string
          id?: string
          lote?: string | null
          pedido_item_id?: string | null
          producto_id?: string
          remision_id?: string
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remision_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "v_order_item_breakdown"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "remision_items_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "remisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["remision_id"]
          },
          {
            foreignKeyName: "remision_items_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["remision_id"]
          },
        ]
      }
      remisiones: {
        Row: {
          almacen_id: string
          cliente_id: string | null
          created_at: string
          created_by: string | null
          estado: string
          fecha: string
          folio: string | null
          id: string
          notas: string | null
          pedido_id: string | null
          updated_at: string
        }
        Insert: {
          almacen_id: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          pedido_id?: string | null
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          pedido_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remisiones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      rep_access_events: {
        Row: {
          accuracy: number | null
          created_at: string
          has_location: boolean
          id: string
          lat: number | null
          lng: number | null
          representante_id: string | null
          signed_in_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          has_location?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          representante_id?: string | null
          signed_in_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          has_location?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          representante_id?: string | null
          signed_in_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_access_events_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_access_events_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      rep_achievements: {
        Row: {
          badge_code: string
          description: string | null
          earned_at: string
          id: string
          label: string
          meta: Json
          points: number
          rep_id: string
        }
        Insert: {
          badge_code: string
          description?: string | null
          earned_at?: string
          id?: string
          label: string
          meta?: Json
          points?: number
          rep_id: string
        }
        Update: {
          badge_code?: string
          description?: string | null
          earned_at?: string
          id?: string
          label?: string
          meta?: Json
          points?: number
          rep_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_achievements_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_achievements_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      rep_client_insights: {
        Row: {
          churn_reasons: Json | null
          churn_risk_score: number | null
          cliente_id: string
          cross_sell: Json | null
          generated_at: string
          lost_labs: Json | null
          model: string | null
          raw: Json | null
          reorder_predictions: Json | null
          summary: string | null
        }
        Insert: {
          churn_reasons?: Json | null
          churn_risk_score?: number | null
          cliente_id: string
          cross_sell?: Json | null
          generated_at?: string
          lost_labs?: Json | null
          model?: string | null
          raw?: Json | null
          reorder_predictions?: Json | null
          summary?: string | null
        }
        Update: {
          churn_reasons?: Json | null
          churn_risk_score?: number | null
          cliente_id?: string
          cross_sell?: Json | null
          generated_at?: string
          lost_labs?: Json | null
          model?: string | null
          raw?: Json | null
          reorder_predictions?: Json | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_client_insights_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      rep_coaching: {
        Row: {
          created_at: string
          goals: Json
          id: string
          improvements: Json
          kpis: Json
          rep_id: string
          strengths: Json
          summary: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          goals?: Json
          id?: string
          improvements?: Json
          kpis?: Json
          rep_id: string
          strengths?: Json
          summary?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          goals?: Json
          id?: string
          improvements?: Json
          kpis?: Json
          rep_id?: string
          strengths?: Json
          summary?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_coaching_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_coaching_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      rep_day_closes: {
        Row: {
          avg_time_per_client_min: number
          close_date: string
          created_at: string
          id: string
          km_traveled: number
          narrative: string | null
          orders_amount: number
          orders_count: number
          payments_amount: number
          rep_id: string
          returns_count: number
          top_clients: Json
          visits_count: number
        }
        Insert: {
          avg_time_per_client_min?: number
          close_date: string
          created_at?: string
          id?: string
          km_traveled?: number
          narrative?: string | null
          orders_amount?: number
          orders_count?: number
          payments_amount?: number
          rep_id: string
          returns_count?: number
          top_clients?: Json
          visits_count?: number
        }
        Update: {
          avg_time_per_client_min?: number
          close_date?: string
          created_at?: string
          id?: string
          km_traveled?: number
          narrative?: string | null
          orders_amount?: number
          orders_count?: number
          payments_amount?: number
          rep_id?: string
          returns_count?: number
          top_clients?: Json
          visits_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "rep_day_closes_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_day_closes_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      rep_rutas_guardadas: {
        Row: {
          created_at: string
          fecha: string
          id: string
          legs: Json
          nombre: string | null
          ordered_stops: Json
          origen: string
          polyline: string | null
          representante_id: string | null
          start_lat: number | null
          start_lng: number | null
          total_km: number | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          legs?: Json
          nombre?: string | null
          ordered_stops?: Json
          origen?: string
          polyline?: string | null
          representante_id?: string | null
          start_lat?: number | null
          start_lng?: number | null
          total_km?: number | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          legs?: Json
          nombre?: string | null
          ordered_stops?: Json
          origen?: string
          polyline?: string | null
          representante_id?: string | null
          start_lat?: number | null
          start_lng?: number | null
          total_km?: number | null
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_rutas_guardadas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rep_targets: {
        Row: {
          created_at: string
          id: string
          min_daily: number
          notes: string | null
          period_month: string
          rep_id: string
          target_amount: number
          target_by_lab: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_daily?: number
          notes?: string | null
          period_month: string
          rep_id: string
          target_amount?: number
          target_by_lab?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_daily?: number
          notes?: string | null
          period_month?: string
          rep_id?: string
          target_amount?: number
          target_by_lab?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_targets_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_targets_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      rep_visit_agreements: {
        Row: {
          created_at: string
          description: string
          due_date: string | null
          id: string
          status: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          status?: string
          visit_id: string
        }
        Update: {
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          status?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_visit_agreements_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rep_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      rep_visits: {
        Row: {
          check_in_at: string
          check_in_lat: number | null
          check_in_lng: number | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          cliente_id: string
          created_at: string
          distance_m: number | null
          id: string
          notes: string | null
          outcome: string | null
          override_reason: string | null
          pedido_id: string | null
          photo_paths: string[] | null
          representante_id: string
          signature_path: string | null
          signed_by_name: string | null
        }
        Insert: {
          check_in_at?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          cliente_id: string
          created_at?: string
          distance_m?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          override_reason?: string | null
          pedido_id?: string | null
          photo_paths?: string[] | null
          representante_id: string
          signature_path?: string | null
          signed_by_name?: string | null
        }
        Update: {
          check_in_at?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          cliente_id?: string
          created_at?: string
          distance_m?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          override_reason?: string | null
          pedido_id?: string | null
          photo_paths?: string[] | null
          representante_id?: string
          signature_path?: string | null
          signed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_visits_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "rep_visits_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "rep_visits_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_visits_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      reportes_personalizados: {
        Row: {
          configuracion: Json
          created_at: string
          created_by: string | null
          descripcion: string | null
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          configuracion?: Json
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          configuracion?: Json
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_personalizados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      representantes: {
        Row: {
          activo: boolean
          comision_default_pct: number
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          comision_default_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          comision_default_pct?: number
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "representantes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          role: Database["public"]["Enums"]["app_role"]
          route_key: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          role: Database["public"]["Enums"]["app_role"]
          route_key: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          route_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_route_key_fkey"
            columns: ["route_key"]
            isOneToOne: false
            referencedRelation: "permission_routes"
            referencedColumns: ["route_key"]
          },
        ]
      }
      sales_history: {
        Row: {
          client_id: string | null
          client_name_raw: string | null
          created_at: string
          created_by: string | null
          description: string | null
          empresa_id: string | null
          id: string
          import_batch_id: string | null
          invoice_date: string
          invoice_no: string
          lab_name_raw: string | null
          laboratorio_id: string | null
          product_id: string | null
          quantity: number
          rep_name_raw: string | null
          representante_id: string | null
          revenue: number
          sku: string | null
          source: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_name_raw?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_date: string
          invoice_no: string
          lab_name_raw?: string | null
          laboratorio_id?: string | null
          product_id?: string | null
          quantity?: number
          rep_name_raw?: string | null
          representante_id?: string | null
          revenue?: number
          sku?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_name_raw?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          empresa_id?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_date?: string
          invoice_no?: string
          lab_name_raw?: string | null
          laboratorio_id?: string | null
          product_id?: string | null
          quantity?: number
          rep_name_raw?: string | null
          representante_id?: string | null
          revenue?: number
          sku?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sales_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "sales_history_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "sales_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "sales_history_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sales_history_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_history_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      sat_codigo_agrupador: {
        Row: {
          codigo: string
          created_at: string
          naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
          nivel: number
          nombre: string
          padre: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
          nivel: number
          nombre: string
          padre?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          naturaleza?: Database["public"]["Enums"]["cta_naturaleza"]
          nivel?: number
          nombre?: string
          padre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sat_codigo_agrupador_padre_fkey"
            columns: ["padre"]
            isOneToOne: false
            referencedRelation: "sat_codigo_agrupador"
            referencedColumns: ["codigo"]
          },
        ]
      }
      shortage_events: {
        Row: {
          cantidad: number | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          motivo_id: string | null
          notas: string | null
          pedido_id: string | null
          producto_id: string | null
        }
        Insert: {
          cantidad?: number | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          motivo_id?: string | null
          notas?: string | null
          pedido_id?: string | null
          producto_id?: string | null
        }
        Update: {
          cantidad?: number | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          motivo_id?: string | null
          notas?: string | null
          pedido_id?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "shortage_events_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "shortage_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shortage_events_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "shortage_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "shortage_events_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "shortage_events_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      shortage_reasons: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      sku_aliases: {
        Row: {
          alias_clave: string
          canonical_clave: string
          created_at: string
          id: string
          product_id: string | null
        }
        Insert: {
          alias_clave: string
          canonical_clave: string
          created_at?: string
          id?: string
          product_id?: string | null
        }
        Update: {
          alias_clave?: string
          canonical_clave?: string
          created_at?: string
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "sku_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      slot_contents: {
        Row: {
          barcode: string | null
          created_at: string
          description: string | null
          expiration_date: string | null
          id: string
          lote: string | null
          order_id: string | null
          order_item_id: string | null
          product_id: string | null
          quantity: number
          slot_id: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          lote?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          slot_id: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          description?: string | null
          expiration_date?: string | null
          id?: string
          lote?: string | null
          order_id?: string | null
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          slot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "slot_contents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "slot_contents_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "v_order_item_breakdown"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_contents_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_movements: {
        Row: {
          created_at: string
          delta: number | null
          from_slot_id: string | null
          id: string
          lote: string | null
          note: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          slot_id: string | null
          to_slot_id: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          created_at?: string
          delta?: number | null
          from_slot_id?: string | null
          id?: string
          lote?: string | null
          note?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          slot_id?: string | null
          to_slot_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          created_at?: string
          delta?: number | null
          from_slot_id?: string | null
          id?: string
          lote?: string | null
          note?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          slot_id?: string | null
          to_slot_id?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slot_movements_from_slot_id_fkey"
            columns: ["from_slot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "slot_movements_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_movements_to_slot_id_fkey"
            columns: ["to_slot_id"]
            isOneToOne: false
            referencedRelation: "warehouse_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          almacen_id: string
          cantidad: number
          producto_id: string
          updated_at: string
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          producto_id: string
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string | null
          original_quantity: number
          product_id: string | null
          reason: string | null
          remaining_quantity: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_quantity?: number
          product_id?: string | null
          reason?: string | null
          remaining_quantity?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_quantity?: number
          product_id?: string | null
          reason?: string | null
          remaining_quantity?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      stock_deliveries: {
        Row: {
          created_at: string
          delivery_code: string | null
          delivery_date: string
          delivery_status: string
          id: string
          notes: string | null
          reference: string | null
          supplier: string | null
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          delivery_code?: string | null
          delivery_date?: string
          delivery_status?: string
          id?: string
          notes?: string | null
          reference?: string | null
          supplier?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          delivery_code?: string | null
          delivery_date?: string
          delivery_status?: string
          id?: string
          notes?: string | null
          reference?: string | null
          supplier?: string | null
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      stock_delivery_documents: {
        Row: {
          category: string | null
          delivery_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          delivery_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          delivery_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_delivery_documents_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "stock_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entries: {
        Row: {
          cost_with_iva: number | null
          cost_without_iva: number | null
          created_at: string
          delivery_id: string | null
          effective_weight_kg: number | null
          entry_date: string
          entry_status: string | null
          factory_rate_per_bulto: number | null
          factory_reimbursement: number | null
          id: string
          is_gifted: boolean | null
          is_torton: boolean | null
          maniobra_cost: number | null
          maniobra_crew_size: number | null
          maniobra_rate_per_person: number | null
          maniobra_vendor: string | null
          notes: string | null
          order_id: string | null
          product_id: string | null
          promo_id: string | null
          quantity: number
          supplier: string | null
          updated_at: string
        }
        Insert: {
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          delivery_id?: string | null
          effective_weight_kg?: number | null
          entry_date?: string
          entry_status?: string | null
          factory_rate_per_bulto?: number | null
          factory_reimbursement?: number | null
          id?: string
          is_gifted?: boolean | null
          is_torton?: boolean | null
          maniobra_cost?: number | null
          maniobra_crew_size?: number | null
          maniobra_rate_per_person?: number | null
          maniobra_vendor?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          promo_id?: string | null
          quantity?: number
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          cost_with_iva?: number | null
          cost_without_iva?: number | null
          created_at?: string
          delivery_id?: string | null
          effective_weight_kg?: number | null
          entry_date?: string
          entry_status?: string | null
          factory_rate_per_bulto?: number | null
          factory_reimbursement?: number | null
          id?: string
          is_gifted?: boolean | null
          is_torton?: boolean | null
          maniobra_cost?: number | null
          maniobra_crew_size?: number | null
          maniobra_rate_per_person?: number | null
          maniobra_vendor?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          promo_id?: string | null
          quantity?: number
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_entries_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "stock_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "stock_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      supplier_incidents: {
        Row: {
          cantidad: number | null
          created_at: string
          created_by: string | null
          id: string
          laboratorio_id: string
          monto: number | null
          motivo: string | null
          notas: string | null
          oc_id: string | null
          tipo: string
        }
        Insert: {
          cantidad?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          laboratorio_id: string
          monto?: number | null
          motivo?: string | null
          notas?: string | null
          oc_id?: string | null
          tipo: string
        }
        Update: {
          cantidad?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          laboratorio_id?: string
          monto?: number | null
          motivo?: string | null
          notas?: string | null
          oc_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supplier_incidents_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_incidents_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "supplier_incidents_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "supplier_incidents_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "supplier_incidents_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_incidents_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "supplier_incidents_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_proveedor_report"
            referencedColumns: ["oc_id"]
          },
          {
            foreignKeyName: "supplier_incidents_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_incidents_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_compra"
            referencedColumns: ["oc_id"]
          },
        ]
      }
      supplier_metrics: {
        Row: {
          fill_rate_pct: number
          id: string
          incidencias: number
          laboratorio_id: string
          lead_time_prom_dias: number
          ocs: number
          on_time_pct: number
          periodo: string
          updated_at: string
        }
        Insert: {
          fill_rate_pct?: number
          id?: string
          incidencias?: number
          laboratorio_id: string
          lead_time_prom_dias?: number
          ocs?: number
          on_time_pct?: number
          periodo: string
          updated_at?: string
        }
        Update: {
          fill_rate_pct?: number
          id?: string
          incidencias?: number
          laboratorio_id?: string
          lead_time_prom_dias?: number
          ocs?: number
          on_time_pct?: number
          periodo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_metrics_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_metrics_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "supplier_metrics_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "supplier_metrics_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      transport_types: {
        Row: {
          active: boolean
          capacity_bultos: number
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          capacity_bultos?: number
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          capacity_bultos?: number
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      traspasos_almacen: {
        Row: {
          almacen_destino_id: string
          almacen_origen_id: string
          created_at: string
          created_by: string | null
          estado: string
          fecha: string
          folio: string | null
          id: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          almacen_destino_id: string
          almacen_origen_id: string
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          almacen_destino_id?: string
          almacen_origen_id?: string
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "traspasos_almacen_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
        ]
      }
      traspasos_almacen_items: {
        Row: {
          caducidad: string | null
          cantidad: number
          created_at: string
          id: string
          lote: string | null
          producto_id: string
          traspaso_id: string
        }
        Insert: {
          caducidad?: string | null
          cantidad: number
          created_at?: string
          id?: string
          lote?: string | null
          producto_id: string
          traspaso_id: string
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          created_at?: string
          id?: string
          lote?: string | null
          producto_id?: string
          traspaso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "traspasos_almacen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_items_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["traspaso_id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          route_key: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          route_key: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          route_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          approved: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      visit_form_responses: {
        Row: {
          answers: Json
          created_at: string
          created_by: string | null
          id: string
          representante_id: string | null
          template_id: string
          visit_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          representante_id?: string | null
          template_id: string
          visit_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          representante_id?: string | null
          template_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_form_responses_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_form_responses_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
          {
            foreignKeyName: "visit_form_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "visit_form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_form_responses_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rep_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_form_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          fields: Json
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          fields?: Json
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      visit_shelf_photos: {
        Row: {
          category: string
          cliente_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          photo_path: string
          representante_id: string | null
          visit_id: string
        }
        Insert: {
          category?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          photo_path: string
          representante_id?: string | null
          visit_id: string
        }
        Update: {
          category?: string
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          photo_path?: string
          representante_id?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
          {
            foreignKeyName: "visit_shelf_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rep_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_slots: {
        Row: {
          access_type: string | null
          active: boolean
          block: string | null
          blocked: boolean
          code: string
          created_at: string
          id: string
          position: number | null
          row_letter: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          access_type?: string | null
          active?: boolean
          block?: string | null
          blocked?: boolean
          code: string
          created_at?: string
          id?: string
          position?: number | null
          row_letter?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          access_type?: string | null
          active?: boolean
          block?: string | null
          blocked?: boolean
          code?: string
          created_at?: string
          id?: string
          position?: number | null
          row_letter?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bank_account_balances: {
        Row: {
          cuenta_id: string | null
          empresa_id: string | null
          movimientos: number | null
          saldo_actual: number | null
          total_entradas: number | null
          total_salidas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          active: boolean | null
          address: string | null
          central: string | null
          cfdi_pdf_path: string | null
          client_type: string | null
          codigo_postal: string | null
          company: string | null
          contact: string | null
          created_at: string | null
          credit_limit: number | null
          curp: string | null
          delivery_notes: string | null
          delivery_window_from: string | null
          delivery_window_until: string | null
          email: string | null
          google_place_id: string | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          nickname: string | null
          nombre_cfdi: string | null
          notes: string | null
          payment_method: string | null
          payment_terms: number | null
          phone: string | null
          portal_activo: boolean | null
          price_list_id: string | null
          razon_social: string | null
          representante_id: string | null
          required_documents: Json | null
          rfc: string | null
          token_portal: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          central?: string | null
          cfdi_pdf_path?: string | null
          client_type?: string | null
          codigo_postal?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string | null
          credit_limit?: number | null
          curp?: string | null
          delivery_notes?: string | null
          delivery_window_from?: string | null
          delivery_window_until?: string | null
          email?: string | null
          google_place_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          nickname?: string | null
          nombre_cfdi?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: number | null
          phone?: never
          portal_activo?: boolean | null
          price_list_id?: string | null
          razon_social?: string | null
          representante_id?: string | null
          required_documents?: Json | null
          rfc?: string | null
          token_portal?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          central?: string | null
          cfdi_pdf_path?: string | null
          client_type?: string | null
          codigo_postal?: string | null
          company?: string | null
          contact?: string | null
          created_at?: string | null
          credit_limit?: number | null
          curp?: string | null
          delivery_notes?: string | null
          delivery_window_from?: string | null
          delivery_window_until?: string | null
          email?: string | null
          google_place_id?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          nickname?: string | null
          nombre_cfdi?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: number | null
          phone?: never
          portal_activo?: boolean | null
          price_list_id?: string | null
          razon_social?: string | null
          representante_id?: string | null
          required_documents?: Json | null
          rfc?: string | null
          token_portal?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      delivery_summary: {
        Row: {
          active: boolean | null
          clave: string | null
          delivery_code: string | null
          id: string | null
          image_url: string | null
          last_delivery_date: string | null
          name: string | null
          supplier: string | null
          weight_kg: number | null
        }
        Insert: {
          active?: boolean | null
          clave?: string | null
          delivery_code?: never
          id?: string | null
          image_url?: string | null
          last_delivery_date?: never
          name?: string | null
          supplier?: string | null
          weight_kg?: number | null
        }
        Update: {
          active?: boolean | null
          clave?: string | null
          delivery_code?: never
          id?: string | null
          image_url?: string | null
          last_delivery_date?: never
          name?: string | null
          supplier?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          amount: number | null
          clave_snapshot: string | null
          damaged_batch_id: string | null
          id: string | null
          is_damaged: boolean | null
          iva_pct: number | null
          name_snapshot: string | null
          order_id: string | null
          product_id: string | null
          quantity: number | null
          unit_price_override: number | null
        }
        Insert: {
          amount?: number | null
          clave_snapshot?: string | null
          damaged_batch_id?: string | null
          id?: string | null
          is_damaged?: boolean | null
          iva_pct?: number | null
          name_snapshot?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number | null
          unit_price_override?: number | null
        }
        Update: {
          amount?: number | null
          clave_snapshot?: string | null
          damaged_batch_id?: string | null
          id?: string | null
          is_damaged?: boolean | null
          iva_pct?: number | null
          name_snapshot?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number | null
          unit_price_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_damaged_batch_id_fkey"
            columns: ["damaged_batch_id"]
            isOneToOne: false
            referencedRelation: "damaged_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      order_summary: {
        Row: {
          central: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          client_type: string | null
          delivery_date: string | null
          delivery_notes: string | null
          delivery_window_from: string | null
          delivery_window_until: string | null
          discount_amount: number | null
          discount_reason: string | null
          fulfillment_method: string | null
          id: string | null
          line_items: number | null
          manual_price_count: number | null
          needs_approval: boolean | null
          notes: string | null
          order_code: string | null
          order_date: string | null
          status: string | null
          subtotal: number | null
          total_with_iva: number | null
          urgency: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          created_at: string | null
          delivery_date: string | null
          discount_amount: number | null
          discount_reason: string | null
          fulfillment_method: string | null
          id: string | null
          iva: number | null
          needs_approval: boolean | null
          notes: string | null
          order_code: string | null
          order_date: string | null
          price_list_id: string | null
          signature_path: string | null
          signature_token: string | null
          signed_at: string | null
          signed_by_name: string | null
          status: string | null
          subtotal: number | null
          total: number | null
          updated_at: string | null
          urgency: boolean | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          fulfillment_method?: string | null
          id?: string | null
          iva?: number | null
          needs_approval?: boolean | null
          notes?: string | null
          order_code?: never
          order_date?: never
          price_list_id?: string | null
          signature_path?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: never
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
          urgency?: boolean | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          fulfillment_method?: string | null
          id?: string | null
          iva?: number | null
          needs_approval?: boolean | null
          notes?: string | null
          order_code?: never
          order_date?: never
          price_list_id?: string | null
          signature_path?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          status?: never
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
          urgency?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          bonificacion_pct: number | null
          brand: string | null
          categoria: string | null
          clave: string | null
          cost_with_iva: number | null
          cost_without_iva: number | null
          descripcion: string | null
          especie: string[] | null
          grupo: string | null
          id: string | null
          image_url: string | null
          iva_pct: number | null
          laboratorio_id: string | null
          linea: string | null
          name: string | null
          presentacion: string | null
          sale_price_with_iva: number | null
          sat_clave: string | null
          stock_actual: number | null
          stock_committed: number | null
          stock_disponible: number | null
          stock_incoming: number | null
          supplier: string | null
          tipo_producto: string | null
          unidad: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      v_baja_rotacion: {
        Row: {
          clasificacion: string | null
          costo: number | null
          dias_sin_venta: number | null
          laboratorio: string | null
          nombre: string | null
          producto_id: string | null
          sku: string | null
          stock_fisico: number | null
          ultima_venta: string | null
          valor_inmovilizado: number | null
        }
        Relationships: []
      }
      v_caducidades: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          batch_id: string | null
          caducidad: string | null
          cantidad: number | null
          costo_unitario: number | null
          dias_restantes: number | null
          laboratorio: string | null
          lote: string | null
          nombre: string | null
          producto_id: string | null
          semaforo: string | null
          sku: string | null
          valor_economico: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "product_batches_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_caducidades_clientes: {
        Row: {
          cantidad_prom: number | null
          cliente: string | null
          cliente_id: string | null
          nombre_comercial: string | null
          pedidos_count: number | null
          producto_id: string | null
          representante: string | null
          representante_id: string | null
          total_comprado: number | null
          ultima_compra: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_cardex_material: {
        Row: {
          almacen: string | null
          articulo: string | null
          caducidad: string | null
          cantidad: number | null
          clave: string | null
          fecha: string | null
          id: string | null
          lote: string | null
          naturaleza: string | null
          notas: string | null
          origen: string | null
          producto_id: string | null
          referencia: string | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_cliente_credito_360: {
        Row: {
          bloqueado: boolean | null
          cliente_id: string | null
          dias_credito: number | null
          dias_pago_prom: number | null
          facturas_abiertas: number | null
          facturas_vencidas: number | null
          gestor_id: string | null
          limite_credito: number | null
          motivo_bloqueo: string | null
          nombre_comercial: string | null
          promesas_cumplidas: number | null
          promesas_incumplidas: number | null
          promesas_pendientes: number | null
          razon_social: string | null
          representante_id: string | null
          riesgo_calculado: string | null
          riesgo_manual:
            | Database["public"]["Enums"]["cliente_riesgo_nivel"]
            | null
          saldo_total: number | null
          saldo_vencido: number | null
          ultima_gestion_at: string | null
          ultima_gestion_tipo:
            | Database["public"]["Enums"]["cobranza_gestion_tipo"]
            | null
          utilizacion_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_credito_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "v_comisiones_representante"
            referencedColumns: ["representante_id"]
          },
        ]
      }
      v_cliente_timeline: {
        Row: {
          cliente_id: string | null
          detalle: string | null
          fecha: string | null
          id: string | null
          monto: number | null
          tipo: string | null
          titulo: string | null
        }
        Relationships: []
      }
      v_comisiones_representante: {
        Row: {
          comisiones_30d: number | null
          comisiones_total: number | null
          nombre: string | null
          pedidos_total: number | null
          representante_id: string | null
        }
        Relationships: []
      }
      v_compras_planeacion: {
        Row: {
          cantidad_sugerida: number | null
          categoria: string | null
          consumo_diario: number | null
          costo: number | null
          dias_cobertura: number | null
          dias_cobertura_objetivo: number | null
          en_camino: number | null
          laboratorio: string | null
          laboratorio_id: string | null
          lead_time_dias: number | null
          nombre: string | null
          precio_lista: number | null
          producto_id: string | null
          promo: boolean | null
          promo_activa: boolean | null
          punto_reorden: number | null
          sku: string | null
          stock_comprometido: number | null
          stock_disponible: number | null
          stock_fisico: number | null
          stock_max: number | null
          stock_min: number | null
          tendencia_pct: number | null
          ventas_30d: number | null
          ventas_365d: number | null
          ventas_60d: number | null
          ventas_90d: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      v_corta_caducidad_lento: {
        Row: {
          almacen: string | null
          articulo: string | null
          batch_id: string | null
          caducidad: string | null
          cantidad: number | null
          clasificacion: string | null
          clave: string | null
          dias_para_caducar: number | null
          dias_sin_venta: number | null
          laboratorio: string | null
          lote: string | null
          producto_id: string | null
        }
        Relationships: []
      }
      v_dashboard_resumen: {
        Row: {
          comisiones_mes: number | null
          facturas_pendientes: number | null
          pedidos_abiertos: number | null
          productos_stock_bajo: number | null
          saldo_pendiente: number | null
          ventas_mes: number | null
        }
        Relationships: []
      }
      v_devoluciones: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          cliente: string | null
          cliente_id: string | null
          estado: Database["public"]["Enums"]["devolucion_estado"] | null
          factura_folio: string | null
          factura_id: string | null
          fecha: string | null
          folio: string | null
          id: string | null
          items: number | null
          iva: number | null
          motivo: string | null
          subtotal: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["almacen_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["factura_id"]
          },
          {
            foreignKeyName: "devoluciones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["factura_id"]
          },
        ]
      }
      v_entradas_report: {
        Row: {
          almacen: string | null
          articulo: string | null
          caducidad: string | null
          cantidad: number | null
          clave: string | null
          costo_unitario: number | null
          created_at: string | null
          estado: string | null
          factura_proveedor: string | null
          fecha: string | null
          folio: string | null
          importe: number | null
          item_id: string | null
          lote: string | null
          oc_folio: string | null
          oc_id: string | null
          producto_id: string | null
          proveedor: string | null
          recepcion_id: string | null
        }
        Relationships: []
      }
      v_kardex_movements: {
        Row: {
          created_at: string | null
          delta: number | null
          description: string | null
          id: string | null
          lote: string | null
          note: string | null
          product_clave: string | null
          product_id: string | null
          product_image_url: string | null
          product_name: string | null
          reason: string | null
          slot_code: string | null
          slot_id: string | null
          source: string | null
        }
        Relationships: []
      }
      v_margen_productos: {
        Row: {
          costo: number | null
          margen_pct: number | null
          nombre: string | null
          precio_lista: number | null
          producto_id: string | null
          sku: string | null
        }
        Insert: {
          costo?: number | null
          margen_pct?: never
          nombre?: string | null
          precio_lista?: number | null
          producto_id?: string | null
          sku?: string | null
        }
        Update: {
          costo?: number | null
          margen_pct?: never
          nombre?: string | null
          precio_lista?: number | null
          producto_id?: string | null
          sku?: string | null
        }
        Relationships: []
      }
      v_notas_credito_proveedor_report: {
        Row: {
          articulo: string | null
          cantidad: number | null
          clave: string | null
          costo_unitario: number | null
          created_at: string | null
          factura_proveedor: string | null
          fecha: string | null
          folio: string | null
          importe: number | null
          item_id: string | null
          laboratorio: string | null
          lote: string | null
          motivo: string | null
          nc_id: string | null
          nc_total: number | null
          notas: string | null
          oc_folio: string | null
          oc_id: string | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "notas_credito_proveedor_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
        ]
      }
      v_notas_credito_venta_report: {
        Row: {
          cliente: string | null
          cliente_id: string | null
          created_at: string | null
          devolucion_folio: string | null
          devolucion_id: string | null
          factura_estado: Database["public"]["Enums"]["factura_estado"] | null
          factura_folio: string | null
          factura_id: string | null
          factura_total: number | null
          fecha: string | null
          folio: string | null
          nc_id: string | null
          nc_total: number | null
          notas: string | null
        }
        Relationships: []
      }
      v_open_orders: {
        Row: {
          central: string | null
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          client_type: string | null
          delivery_date: string | null
          delivery_notes: string | null
          delivery_window_from: string | null
          delivery_window_until: string | null
          discount_amount: number | null
          discount_reason: string | null
          fulfillment_method: string | null
          id: string | null
          line_items: number | null
          manual_price_count: number | null
          needs_approval: boolean | null
          notes: string | null
          order_code: string | null
          order_date: string | null
          status: string | null
          subtotal: number | null
          total_with_iva: number | null
          urgency: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_ordenes_compra: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          estado: Database["public"]["Enums"]["oc_estado"] | null
          fecha_emision: string | null
          fecha_esperada: string | null
          fecha_recepcion: string | null
          folio: string | null
          id: string | null
          items: number | null
          iva: number | null
          laboratorio: string | null
          laboratorio_id: string | null
          pendiente_unidades: number | null
          subtotal: number | null
          total: number | null
        }
        Relationships: []
      }
      v_order_item_breakdown: {
        Row: {
          amount: number | null
          clave_snapshot: string | null
          client_id: string | null
          delivery_date: string | null
          id: string | null
          iva_pct: number | null
          name_snapshot: string | null
          order_date: string | null
          order_id: string | null
          product_id: string | null
          quantity: number | null
          status: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "delivery_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_baja_rotacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_compras_planeacion"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_corta_caducidad_lento"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_entradas_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_margen_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_products_with_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_needs"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_sin_movimiento_venta"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_bajo"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_top_productos"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traspasos_report"
            referencedColumns: ["producto_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_pedidos_por_mes: {
        Row: {
          mes: string | null
          mes_inicio: string | null
          pedidos: number | null
          subtotal: number | null
        }
        Relationships: []
      }
      v_products_with_stock: {
        Row: {
          active: boolean | null
          bonificacion_pct: number | null
          brand: string | null
          categoria: string | null
          clave: string | null
          cost_with_iva: number | null
          cost_without_iva: number | null
          descripcion: string | null
          especie: string[] | null
          grupo: string | null
          id: string | null
          image_url: string | null
          iva_pct: number | null
          laboratorio_id: string | null
          linea: string | null
          name: string | null
          presentacion: string | null
          sale_price_with_iva: number | null
          sat_clave: string | null
          stock_actual: number | null
          stock_committed: number | null
          stock_disponible: number | null
          stock_incoming: number | null
          supplier: string | null
          tipo_producto: string | null
          unidad: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "laboratorios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_ordenes_compra"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_stock_productos"
            referencedColumns: ["laboratorio_id"]
          },
          {
            foreignKeyName: "productos_laboratorio_id_fkey"
            columns: ["laboratorio_id"]
            isOneToOne: false
            referencedRelation: "v_supplier_kpis"
            referencedColumns: ["laboratorio_id"]
          },
        ]
      }
      v_purchase_by_order: {
        Row: {
          client_id: string | null
          created_at: string | null
          delivery_date: string | null
          order_id: string | null
          status: string | null
          total_amount: number | null
          total_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_cliente_credito_360"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_notas_credito_venta_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_remisiones_report"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_saldos_clientes"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_top_clientes"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_purchase_needs: {
        Row: {
          clave: string | null
          name: string | null
          pending_qty: number | null
          product_id: string | null
          shortage: number | null
          stock_disponible: number | null
          stock_en_camino: number | null
          stock_minimo: number | null
        }
        Relationships: []
      }
      v_remisiones_report: {
        Row: {
          almacen: string | null
          articulo: string | null
          caducidad: string | null
          cantidad: number | null
          clave: string | null
          cliente: string | null
          cliente_id: string | null
          created_at: string | null
          estado: string | null
          fecha: string | null
          folio: string | null
          lote: string | null
          pedido_folio: string | null
          pedido_id: string | null
          producto_id: string | null
          remision_id: string | null
          ubicacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "order_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_open_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_purchase_by_order"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "remisiones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      v_saldos_clientes: {
        Row: {
          cliente_id: string | null
          facturas_abiertas: number | null
          nombre_comercial: string | null
          razon_social: string | null
          saldo_1_30: number | null
          saldo_31_60: number | null
          saldo_61_90: number | null
          saldo_corriente: number | null
          saldo_mas_90: number | null
          saldo_total: number | null
        }
        Relationships: []
      }
      v_sin_movimiento_venta: {
        Row: {
          articulo: string | null
          categoria: string | null
          clave: string | null
          dias_sin_venta: number | null
          existencia: number | null
          laboratorio: string | null
          marca: string | null
          producto_id: string | null
          ultima_venta: string | null
        }
        Relationships: []
      }
      v_stock_bajo: {
        Row: {
          nombre: string | null
          producto_id: string | null
          sku: string | null
          stock_minimo: number | null
          stock_total: number | null
        }
        Relationships: []
      }
      v_stock_productos: {
        Row: {
          activo: boolean | null
          bajo_minimo: boolean | null
          laboratorio: string | null
          laboratorio_id: string | null
          nombre: string | null
          producto_id: string | null
          sku: string | null
          stock_minimo: number | null
          stock_total: number | null
          unidad: string | null
        }
        Relationships: []
      }
      v_supplier_kpis: {
        Row: {
          fill_rate_pct: number | null
          incidencias_12m: number | null
          laboratorio: string | null
          laboratorio_id: string | null
          lead_time_prom_dias: number | null
          ocs_12m: number | null
          on_time_pct: number | null
        }
        Relationships: []
      }
      v_top_clientes: {
        Row: {
          cliente_id: string | null
          nombre_comercial: string | null
          pedidos: number | null
          razon_social: string | null
          ventas: number | null
        }
        Relationships: []
      }
      v_top_productos: {
        Row: {
          ingreso: number | null
          nombre: string | null
          producto_id: string | null
          sku: string | null
          unidades: number | null
        }
        Relationships: []
      }
      v_traspasos_report: {
        Row: {
          almacen_destino: string | null
          almacen_origen: string | null
          articulo: string | null
          caducidad: string | null
          cantidad: number | null
          clave: string | null
          created_at: string | null
          estado: string | null
          fecha: string | null
          folio: string | null
          lote: string | null
          notas: string | null
          producto_id: string | null
          traspaso_id: string | null
        }
        Relationships: []
      }
      v_trazabilidad_compra: {
        Row: {
          factura_proveedor: string | null
          factura_proveedor_fecha: string | null
          fecha_emision: string | null
          fecha_recepcion: string | null
          oc_estado: Database["public"]["Enums"]["oc_estado"] | null
          oc_folio: string | null
          oc_id: string | null
          proveedor: string | null
          recepcion_estado: string | null
          recepcion_folio: string | null
          recepcion_id: string | null
          total: number | null
        }
        Relationships: []
      }
      v_trazabilidad_venta: {
        Row: {
          cliente: string | null
          factura_estado: Database["public"]["Enums"]["factura_estado"] | null
          factura_fecha: string | null
          factura_folio: string | null
          factura_id: string | null
          factura_total: number | null
          pedido_fecha: string | null
          pedido_folio: string | null
          pedido_id: string | null
          remision_estado: string | null
          remision_fecha: string | null
          remision_folio: string | null
          remision_id: string | null
        }
        Relationships: []
      }
      v_usuarios_roles: {
        Row: {
          created_at: string | null
          email: string | null
          last_sign_in_at: string | null
          roles: Database["public"]["Enums"]["app_role"][] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          last_sign_in_at?: string | null
          roles?: never
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          last_sign_in_at?: string | null
          roles?: never
          user_id?: string | null
        }
        Relationships: []
      }
      v_ventas_por_mes: {
        Row: {
          facturas: number | null
          iva: number | null
          mes: string | null
          mes_inicio: string | null
          pagado: number | null
          subtotal: number | null
          total: number | null
        }
        Relationships: []
      }
      v_ventas_unified: {
        Row: {
          client_id: string | null
          client_name: string | null
          description: string | null
          empresa_id: string | null
          fecha: string | null
          fuente: string | null
          id: string | null
          invoice_no: string | null
          lab_name: string | null
          laboratorio_id: string | null
          product_id: string | null
          quantity: number | null
          rep_name: string | null
          representante_id: string | null
          revenue: number | null
          sku: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _alm_next_folio: {
        Args: { _prefix: string; _table: unknown }
        Returns: string
      }
      _aplicar_stock: {
        Args: { _almacen: string; _delta: number; _producto: string }
        Returns: undefined
      }
      _cfg_text: { Args: { p_key: string }; Returns: string }
      _find_cuenta: {
        Args: { p_codigo: string; p_empresa: string }
        Returns: string
      }
      _find_periodo: {
        Args: { p_empresa: string; p_fecha: string }
        Returns: string
      }
      _mover_lote: {
        Args: {
          _almacen: string
          _caducidad: string
          _costo?: number
          _delta: number
          _lote: string
          _producto: string
        }
        Returns: undefined
      }
      _next_poliza_folio: {
        Args: {
          p_empresa: string
          p_fecha: string
          p_tipo: Database["public"]["Enums"]["poliza_tipo"]
        }
        Returns: string
      }
      admin_list_all_routes: {
        Args: never
        Returns: {
          active: boolean
          group_label: string
          route_key: string
          route_path: string
          sort_order: number
        }[]
      }
      admin_set_role_permission: {
        Args: {
          p_allowed: boolean
          p_role: Database["public"]["Enums"]["app_role"]
          p_route_key: string
        }
        Returns: undefined
      }
      admin_set_route_active: {
        Args: { p_active: boolean; p_route_key: string }
        Returns: undefined
      }
      ajustar_stock: {
        Args: {
          _almacen: string
          _notas?: string
          _nueva_cantidad: number
          _producto: string
        }
        Returns: undefined
      }
      aplicar_devolucion: { Args: { _dev: string }; Returns: string }
      asignar_rol: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      balanza_de_comprobacion:
        | {
            Args: { _desde: string; _empresa: string; _hasta: string }
            Returns: {
              abonos: number
              cargos: number
              codigo: string
              codigo_agrupador: string
              cuenta_id: string
              naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
              nivel: number
              nombre: string
              saldo_final: number
              saldo_inicial: number
            }[]
          }
        | {
            Args: {
              _desde: string
              _empresa: string
              _hasta: string
              _incluir_borradores?: boolean
            }
            Returns: {
              abonos: number
              cargos: number
              codigo: string
              codigo_agrupador: string
              cuenta_id: string
              naturaleza: Database["public"]["Enums"]["cta_naturaleza"]
              nivel: number
              nombre: string
              saldo_final: number
              saldo_inicial: number
            }[]
          }
      bank_account_saldo: { Args: { _cuenta: string }; Returns: number }
      bootstrap_admin: { Args: never; Returns: undefined }
      cancelar_recepcion: {
        Args: { _motivo?: string; _rec: string }
        Returns: undefined
      }
      cancelar_remision: {
        Args: { _motivo?: string; _rem: string }
        Returns: undefined
      }
      clients_dashboard_stats: {
        Args: { _date_from?: string; _date_to?: string }
        Returns: Json
      }
      crear_factura_desde_pedido: {
        Args: {
          _dias_credito?: number
          _fecha_emision?: string
          _pedido: string
        }
        Returns: string
      }
      crear_pedido_para_token: {
        Args: {
          _contacto_email?: string
          _contacto_nombre?: string
          _contacto_telefono?: string
          _items: Json
          _notas_cliente?: string
          _token: string
        }
        Returns: {
          folio: string
          id: string
        }[]
      }
      crear_remision: {
        Args: {
          _almacen: string
          _items: Json
          _notas?: string
          _pedido: string
        }
        Returns: string
      }
      create_order_with_client: {
        Args: {
          p_address?: string
          p_client_name: string
          p_delivery_date?: string
          p_notes?: string
          p_payment_method?: string
          p_phone?: string
          p_rfc?: string
        }
        Returns: string
      }
      create_remision_inventory_movs: {
        Args: { p_trip_id: string }
        Returns: number
      }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      dashboard_kpis_for_range: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      delete_user_as_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      dev_recalc: { Args: { _dev: string }; Returns: undefined }
      dispatch_order: { Args: { p_order_id: string }; Returns: Json }
      editar_recepcion: {
        Args: { _factura?: string; _items: Json; _notas?: string; _rec: string }
        Returns: string
      }
      editar_remision: {
        Args: { _items: Json; _notas?: string; _rem: string }
        Returns: string
      }
      ejecutar_traspaso: {
        Args: {
          _destino: string
          _fecha?: string
          _items: Json
          _notas?: string
          _origen: string
        }
        Returns: string
      }
      facturar_pedido: {
        Args: { _dias_credito?: number; _pedido: string }
        Returns: Json
      }
      facturas_recalc: { Args: { _factura: string }; Returns: undefined }
      fmt_month: { Args: { d: string }; Returns: string }
      get_all_users_for_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          last_sign_in_at: string
          raw_user_meta_data: Json
        }[]
      }
      get_catalog_for_token: {
        Args: { _token: string }
        Returns: {
          cliente: Json
          productos: Json
        }[]
      }
      get_my_permissions: {
        Args: never
        Returns: {
          group_label: string
          route_key: string
          route_path: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_or_create_embarque_slot: { Args: never; Returns: string }
      get_order_fulfillment_state: {
        Args: { p_order_id: string }
        Returns: {
          embarque_slots: Json
          order_item_id: string
          product_clave: string
          product_id: string
          product_image_url: string
          product_name: string
          qty_in_embarque: number
          qty_needed: number
          qty_remaining: number
        }[]
      }
      get_role_permissions: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: {
          allowed: boolean
          group_label: string
          route_key: string
          route_path: string
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iva_ieps_saldos: {
        Args: { _empresa: string; _hasta: string }
        Returns: {
          base: number
          monto: number
          tasa: number
          tipo: Database["public"]["Enums"]["impuesto_tipo"]
        }[]
      }
      libro_mayor_cuenta:
        | {
            Args: { _cuenta: string; _desde: string; _hasta: string }
            Returns: {
              abono: number
              cargo: number
              concepto: string
              fecha: string
              folio: string
              poliza_id: string
              saldo: number
              tipo: Database["public"]["Enums"]["poliza_tipo"]
              uuid_cfdi: string
            }[]
          }
        | {
            Args: {
              _cuenta: string
              _desde: string
              _hasta: string
              _incluir_borradores?: boolean
            }
            Returns: {
              abono: number
              cargo: number
              concepto: string
              estado: string
              fecha: string
              folio: string
              poliza_id: string
              saldo: number
              tipo: Database["public"]["Enums"]["poliza_tipo"]
              uuid_cfdi: string
            }[]
          }
      list_orders_to_fulfill: {
        Args: { p_horizon_days?: number }
        Returns: {
          client_id: string
          client_name: string
          delivery_date: string
          delivery_notes: string
          delivery_offset_days: number
          delivery_window_from: string
          delivery_window_until: string
          fulfillment_method: string
          id: string
          item_count: number
          order_code: string
          status: string
          total_bultos_in_embarque: number
          total_bultos_needed: number
          urgency: boolean
        }[]
      }
      list_pedidos_por_facturar: {
        Args: never
        Returns: {
          cliente: string
          cliente_id: string
          created_at: string
          delivery_date: string
          estado: string
          folio: string
          id: string
          iva: number
          order_code: string
          rfc: string
          subtotal: number
          total: number
        }[]
      }
      list_recent_reubicaciones: {
        Args: { p_limit?: number }
        Returns: {
          can_undo: boolean
          created_at: string
          description: string
          dest_slot_code: string
          id: string
          lote: string
          minutes_ago: number
          note: string
          product_clave: string
          product_image_url: string
          product_name: string
          quantity: number
          source_slot_code: string
          user_id: string
        }[]
      }
      listar_usuarios: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      mark_pickup_delivered: { Args: { p_order_id: string }; Returns: Json }
      oc_recalc_totales: { Args: { _oc: string }; Returns: undefined }
      orders_dashboard_stats: {
        Args: {
          p_client_ids?: string[]
          p_client_type?: string
          p_from?: string
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      pedidos_recalc_totals: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      pick_order_item_to_embarque: {
        Args: {
          p_note?: string
          p_order_item_id: string
          p_quantity: number
          p_source_content_id: string
        }
        Returns: Json
      }
      polizas_recalc: { Args: { _poliza: string }; Returns: undefined }
      post_factura_poliza: { Args: { p_factura_id: string }; Returns: string }
      post_pago_poliza: { Args: { p_pago_id: string }; Returns: string }
      recalcular_bloqueos_compra: { Args: never; Returns: number }
      recibir_oc: { Args: { _items: Json; _oc: string }; Returns: undefined }
      registrar_recepcion: {
        Args: { _factura?: string; _items: Json; _notas?: string; _oc: string }
        Returns: string
      }
      remover_rol: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      resync_price_list: {
        Args: { p_list_id: string }
        Returns: {
          inserted: number
          skipped_overridden: number
          updated: number
        }[]
      }
      revert_movement: {
        Args: { p_movement_id: string; p_note?: string }
        Returns: string
      }
      sales_dashboard_stats: {
        Args: { p_from?: string; p_fuente?: string; p_to?: string }
        Returns: Json
      }
      seed_cuentas_empresa: { Args: { _empresa: string }; Returns: undefined }
      suggest_source_slots_for_picking: {
        Args: { p_product_id: string; p_quantity?: number }
        Returns: {
          expiration_date: string
          lote: string
          quantity: number
          rank: number
          reason_text: string
          slot_code: string
          slot_content_id: string
          slot_id: string
        }[]
      }
      undo_movement: { Args: { p_movement_id: string }; Returns: undefined }
      ventas_unified_stats: {
        Args: {
          p_client_id?: string
          p_from?: string
          p_fuente?: string
          p_lab_id?: string
          p_product_id?: string
          p_rep_id?: string
          p_to?: string
          p_top_n?: number
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "representante"
        | "ventas"
        | "almacen"
        | "logistica"
        | "contabilidad"
        | "viewer"
        | "compras"
        | "facturacion"
        | "cobranza"
      autorizacion_estado: "solicitada" | "aprobada" | "rechazada" | "cancelada"
      autorizacion_tipo:
        | "desbloqueo"
        | "incremento_limite"
        | "excepcion_credito"
        | "ampliacion_plazo"
      bank_movement_kind:
        | "entrada"
        | "salida"
        | "traspaso_in"
        | "traspaso_out"
        | "nomina"
        | "comision"
        | "interes"
        | "ajuste"
      cliente_riesgo_nivel: "bajo" | "medio" | "alto" | "critico"
      cobranza_gestion_resultado:
        | "contactado"
        | "no_contesta"
        | "buzon"
        | "promesa_pago"
        | "disputa"
        | "pago_realizado"
        | "sin_respuesta"
        | "otro"
      cobranza_gestion_tipo:
        | "llamada"
        | "correo"
        | "whatsapp"
        | "sms"
        | "visita"
        | "otro"
      cta_naturaleza: "deudora" | "acreedora"
      devolucion_estado: "borrador" | "aplicada" | "cancelada"
      factura_estado:
        | "borrador"
        | "emitida"
        | "parcial"
        | "pagada"
        | "cancelada"
      impuesto_tipo:
        | "iva_trasladado_cobrado"
        | "iva_trasladado_pendiente"
        | "iva_acreditable_pagado"
        | "iva_acreditable_pendiente"
        | "ieps_trasladado_cobrado"
        | "ieps_trasladado_pendiente"
        | "ieps_acreditable_pagado"
        | "ieps_acreditable_pendiente"
        | "ret_isr"
        | "ret_iva"
      movimiento_tipo: "entrada" | "salida" | "ajuste" | "venta" | "devolucion"
      oc_estado: "borrador" | "enviada" | "parcial" | "recibida" | "cancelada"
      onboarding_categoria:
        | "empresa"
        | "catalogos"
        | "precios"
        | "promociones"
        | "branding"
        | "documentos_legales"
        | "integraciones"
        | "comunicaciones"
        | "otros"
      onboarding_estado: "pendiente" | "en_proceso" | "entregado" | "no_aplica"
      pago_metodo: "efectivo" | "transferencia" | "cheque" | "tarjeta" | "otro"
      pedido_estado:
        | "pendiente"
        | "confirmado"
        | "enviado"
        | "entregado"
        | "cancelado"
        | "Pendiente portal"
        | "Pendiente aprobación"
        | "Reservado"
        | "Nuevo"
        | "Confirmado"
        | "En preparacion"
        | "En ruta"
        | "Entregado"
        | "Cancelado"
      periodo_estado: "abierto" | "cerrado" | "enviado_sat"
      poliza_estado: "borrador" | "asentada" | "cancelada"
      poliza_tipo: "ingreso" | "egreso" | "diario"
      promesa_estado: "pendiente" | "cumplida" | "incumplida" | "cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "representante",
        "ventas",
        "almacen",
        "logistica",
        "contabilidad",
        "viewer",
        "compras",
        "facturacion",
        "cobranza",
      ],
      autorizacion_estado: ["solicitada", "aprobada", "rechazada", "cancelada"],
      autorizacion_tipo: [
        "desbloqueo",
        "incremento_limite",
        "excepcion_credito",
        "ampliacion_plazo",
      ],
      bank_movement_kind: [
        "entrada",
        "salida",
        "traspaso_in",
        "traspaso_out",
        "nomina",
        "comision",
        "interes",
        "ajuste",
      ],
      cliente_riesgo_nivel: ["bajo", "medio", "alto", "critico"],
      cobranza_gestion_resultado: [
        "contactado",
        "no_contesta",
        "buzon",
        "promesa_pago",
        "disputa",
        "pago_realizado",
        "sin_respuesta",
        "otro",
      ],
      cobranza_gestion_tipo: [
        "llamada",
        "correo",
        "whatsapp",
        "sms",
        "visita",
        "otro",
      ],
      cta_naturaleza: ["deudora", "acreedora"],
      devolucion_estado: ["borrador", "aplicada", "cancelada"],
      factura_estado: ["borrador", "emitida", "parcial", "pagada", "cancelada"],
      impuesto_tipo: [
        "iva_trasladado_cobrado",
        "iva_trasladado_pendiente",
        "iva_acreditable_pagado",
        "iva_acreditable_pendiente",
        "ieps_trasladado_cobrado",
        "ieps_trasladado_pendiente",
        "ieps_acreditable_pagado",
        "ieps_acreditable_pendiente",
        "ret_isr",
        "ret_iva",
      ],
      movimiento_tipo: ["entrada", "salida", "ajuste", "venta", "devolucion"],
      oc_estado: ["borrador", "enviada", "parcial", "recibida", "cancelada"],
      onboarding_categoria: [
        "empresa",
        "catalogos",
        "precios",
        "promociones",
        "branding",
        "documentos_legales",
        "integraciones",
        "comunicaciones",
        "otros",
      ],
      onboarding_estado: ["pendiente", "en_proceso", "entregado", "no_aplica"],
      pago_metodo: ["efectivo", "transferencia", "cheque", "tarjeta", "otro"],
      pedido_estado: [
        "pendiente",
        "confirmado",
        "enviado",
        "entregado",
        "cancelado",
        "Pendiente portal",
        "Pendiente aprobación",
        "Reservado",
        "Nuevo",
        "Confirmado",
        "En preparacion",
        "En ruta",
        "Entregado",
        "Cancelado",
      ],
      periodo_estado: ["abierto", "cerrado", "enviado_sat"],
      poliza_estado: ["borrador", "asentada", "cancelada"],
      poliza_tipo: ["ingreso", "egreso", "diario"],
      promesa_estado: ["pendiente", "cumplida", "incumplida", "cancelada"],
    },
  },
} as const
