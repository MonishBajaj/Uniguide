
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_runs": {
                  Row: {
                    "cost_usd": number | null,"created_at": string,"id": string,"input_hash": string | null,"input_tokens": number | null,"latency_ms": number | null,"model": string,"output_tokens": number | null,"prompt_version": string,"purpose": string,"stop_reason": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number | null,"created_at"?: string,"id"?: string,"input_hash"?: string | null,"input_tokens"?: number | null,"latency_ms"?: number | null,"model": string,"output_tokens"?: number | null,"prompt_version": string,"purpose": string,"stop_reason"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "cost_usd"?: number | null,"created_at"?: string,"id"?: string,"input_hash"?: string | null,"input_tokens"?: number | null,"latency_ms"?: number | null,"model"?: string,"output_tokens"?: number | null,"prompt_version"?: string,"purpose"?: string,"stop_reason"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"applications": {
                  Row: {
                    "awarded_aid": number | null,"awarded_aid_currency": string | null,"created_at": string,"cycle_id": string,"decided_at": string | null,"decision": Database["public"]['Enums']["decision"] | null,"deposit_due_at": string | null,"due_at": string | null,"id": string,"notes": string | null,"status": Database["public"]['Enums']["application_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "awarded_aid"?: number | null,"awarded_aid_currency"?: string | null,"created_at"?: string,"cycle_id": string,"decided_at"?: string | null,"decision"?: Database["public"]['Enums']["decision"] | null,"deposit_due_at"?: string | null,"due_at"?: string | null,"id"?: string,"notes"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "awarded_aid"?: number | null,"awarded_aid_currency"?: string | null,"created_at"?: string,"cycle_id"?: string,"decided_at"?: string | null,"decision"?: Database["public"]['Enums']["decision"] | null,"deposit_due_at"?: string | null,"due_at"?: string | null,"id"?: string,"notes"?: string | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    }
                  ]
                },"checklist_items": {
                  Row: {
                    "application_id": string,"created_at": string,"deadline_id": string | null,"details": string | null,"done": boolean,"done_at": string | null,"due_at": string | null,"id": string,"kind": string,"link": string | null,"requirement_id": string | null,"sort": number,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"deadline_id"?: string | null,"details"?: string | null,"done"?: boolean,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"requirement_id"?: string | null,"sort"?: number,"title": string,"user_id": string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"deadline_id"?: string | null,"details"?: string | null,"done"?: boolean,"done_at"?: string | null,"due_at"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"requirement_id"?: string | null,"sort"?: number,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_items_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checklist_items_deadline_id_fkey"
      columns: ["deadline_id"]
isOneToOne: false
      referencedRelation: "deadlines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checklist_items_requirement_id_fkey"
      columns: ["requirement_id"]
isOneToOne: false
      referencedRelation: "requirements"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_age_rules": {
                  Row: {
                    "basis": string,"country": string,"parental_consent_below": number
                  }
                  ComputedFields: never
                  Insert: {
                    "basis": string,"country": string,"parental_consent_below": number
                  }
                  Update: {
                    "basis"?: string,"country"?: string,"parental_consent_below"?: number
                  }
                  Relationships: [
                    
                  ]
                },"consents": {
                  Row: {
                    "evidence": NonNullable<Json>,"granted_at": string,"id": string,"kind": Database["public"]['Enums']["consent_kind"],"method": string,"policy_version": string,"user_id": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "evidence"?: NonNullable<Json>,"granted_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["consent_kind"],"method": string,"policy_version": string,"user_id": string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "evidence"?: NonNullable<Json>,"granted_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["consent_kind"],"method"?: string,"policy_version"?: string,"user_id"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"cost_items": {
                  Row: {
                    "applicant_category": Database["public"]['Enums']["applicant_category"],"base": number,"basis": Database["public"]['Enums']["cost_basis"],"created_at": string,"currency": string,"current_version_id": string | null,"cycle_id": string,"details": string | null,"evidence_quote": string | null,"fee_year": string | null,"high": number,"id": string,"kind": Database["public"]['Enums']["cost_kind"],"low": number,"mandatory": boolean,"published": boolean,"source_id": string | null,"status": Database["public"]['Enums']["fact_status"],"updated_at": string,"verification_method": Database["public"]['Enums']["verification_method"] | null,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"base": number,"basis": Database["public"]['Enums']["cost_basis"],"created_at"?: string,"currency": string,"current_version_id"?: string | null,"cycle_id": string,"details"?: string | null,"evidence_quote"?: string | null,"fee_year"?: string | null,"high": number,"id"?: string,"kind": Database["public"]['Enums']["cost_kind"],"low": number,"mandatory"?: boolean,"published"?: boolean,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"base"?: number,"basis"?: Database["public"]['Enums']["cost_basis"],"created_at"?: string,"currency"?: string,"current_version_id"?: string | null,"cycle_id"?: string,"details"?: string | null,"evidence_quote"?: string | null,"fee_year"?: string | null,"high"?: number,"id"?: string,"kind"?: Database["public"]['Enums']["cost_kind"],"low"?: number,"mandatory"?: boolean,"published"?: boolean,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_items_current_version_id_fkey"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "fact_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_items_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_items_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_ledger": {
                  Row: {
                    "created_at": string,"delta": number,"id": string,"reason": string,"ref": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"delta": number,"id"?: string,"reason": string,"ref"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"delta"?: number,"id"?: string,"reason"?: string,"ref"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deadlines": {
                  Row: {
                    "applicant_category": Database["public"]['Enums']["applicant_category"],"created_at": string,"current_version_id": string | null,"cycle_id": string,"due_at": string,"evidence_quote": string | null,"id": string,"kind": Database["public"]['Enums']["deadline_kind"],"original_text": string | null,"owning_system": Database["public"]['Enums']["owning_system"],"precision": Database["public"]['Enums']["date_precision"],"published": boolean,"round": string | null,"source_id": string | null,"status": Database["public"]['Enums']["fact_status"],"timezone": string,"updated_at": string,"verification_method": Database["public"]['Enums']["verification_method"] | null,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"created_at"?: string,"current_version_id"?: string | null,"cycle_id": string,"due_at": string,"evidence_quote"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["deadline_kind"],"original_text"?: string | null,"owning_system"?: Database["public"]['Enums']["owning_system"],"precision"?: Database["public"]['Enums']["date_precision"],"published"?: boolean,"round"?: string | null,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"timezone"?: string,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"created_at"?: string,"current_version_id"?: string | null,"cycle_id"?: string,"due_at"?: string,"evidence_quote"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["deadline_kind"],"original_text"?: string | null,"owning_system"?: Database["public"]['Enums']["owning_system"],"precision"?: Database["public"]['Enums']["date_precision"],"published"?: boolean,"round"?: string | null,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"timezone"?: string,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deadlines_current_version_id_fkey"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "fact_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deadlines_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deadlines_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"document_versions": {
                  Row: {
                    "authorship": NonNullable<Json>,"body": string,"created_at": string,"document_id": string,"id": string,"user_id": string,"word_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "authorship"?: NonNullable<Json>,"body": string,"created_at"?: string,"document_id": string,"id"?: string,"user_id": string,"word_count": number
                  }
                  Update: {
                    "authorship"?: NonNullable<Json>,"body"?: string,"created_at"?: string,"document_id"?: string,"id"?: string,"user_id"?: string,"word_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_versions_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "application_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["document_kind"],"question": string | null,"title": string,"updated_at": string,"user_id": string,"word_limit": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["document_kind"],"question"?: string | null,"title": string,"updated_at"?: string,"user_id": string,"word_limit"?: number | null
                  }
                  Update: {
                    "application_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["document_kind"],"question"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"word_limit"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"fact_reports": {
                  Row: {
                    "created_at": string,"evidence_url": string | null,"fact_id": string | null,"id": string,"message": string,"program_id": string,"resolved_at": string | null,"resolved_by": string | null,"status": string,"subject": Database["public"]['Enums']["fact_subject"] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence_url"?: string | null,"fact_id"?: string | null,"id"?: string,"message": string,"program_id": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"subject"?: Database["public"]['Enums']["fact_subject"] | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence_url"?: string | null,"fact_id"?: string | null,"id"?: string,"message"?: string,"program_id"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"subject"?: Database["public"]['Enums']["fact_subject"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fact_reports_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fact_reports_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"fact_versions": {
                  Row: {
                    "ai_run_id": string | null,"conflicts_with": (string)[],"created_at": string,"created_by": string,"cycle_id": string,"evidence": NonNullable<Json>,"evidence_quote": string,"extractor_version": string | null,"id": string,"proposed": NonNullable<Json>,"reject_reason": string | null,"review_state": Database["public"]['Enums']["review_state"],"reviewed_at": string | null,"reviewed_by": string | null,"source_id": string,"subject": Database["public"]['Enums']["fact_subject"],"subject_id": string | null,"validation": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_run_id"?: string | null,"conflicts_with"?: (string)[],"created_at"?: string,"created_by"?: string,"cycle_id": string,"evidence"?: NonNullable<Json>,"evidence_quote": string,"extractor_version"?: string | null,"id"?: string,"proposed": NonNullable<Json>,"reject_reason"?: string | null,"review_state"?: Database["public"]['Enums']["review_state"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id": string,"subject": Database["public"]['Enums']["fact_subject"],"subject_id"?: string | null,"validation"?: NonNullable<Json>
                  }
                  Update: {
                    "ai_run_id"?: string | null,"conflicts_with"?: (string)[],"created_at"?: string,"created_by"?: string,"cycle_id"?: string,"evidence"?: NonNullable<Json>,"evidence_quote"?: string,"extractor_version"?: string | null,"id"?: string,"proposed"?: NonNullable<Json>,"reject_reason"?: string | null,"review_state"?: Database["public"]['Enums']["review_state"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"source_id"?: string,"subject"?: Database["public"]['Enums']["fact_subject"],"subject_id"?: string | null,"validation"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "fact_versions_ai_run_fk"
      columns: ["ai_run_id"]
isOneToOne: false
      referencedRelation: "ai_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fact_versions_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fact_versions_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"fetch_log": {
                  Row: {
                    "bytes": number | null,"content_hash": string | null,"fetched_at": string,"host": string,"http_status": number | null,"id": number,"not_modified": boolean,"robots_allowed": boolean,"run_id": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number | null,"content_hash"?: string | null,"fetched_at"?: string,"host": string,"http_status"?: number | null,"id"?: never,"not_modified"?: boolean,"robots_allowed": boolean,"run_id"?: string | null,"url": string
                  }
                  Update: {
                    "bytes"?: number | null,"content_hash"?: string | null,"fetched_at"?: string,"host"?: string,"http_status"?: number | null,"id"?: never,"not_modified"?: boolean,"robots_allowed"?: boolean,"run_id"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fetch_log_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "ingest_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "as_of": string,"base": string,"quote": string,"rate": number,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "as_of": string,"base": string,"quote": string,"rate": number,"source": string
                  }
                  Update: {
                    "as_of"?: string,"base"?: string,"quote"?: string,"rate"?: number,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingest_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"job": string,"started_at": string,"stats": NonNullable<Json>,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job": string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job"?: string,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"institutions": {
                  Row: {
                    "city": string | null,"country": string,"created_at": string,"cricos_provider_code": string | null,"id": string,"ipeds_unitid": string | null,"name": string,"official_domain": string | null,"other_ids": NonNullable<Json>,"region": string | null,"ror_id": string | null,"source_id": string | null,"ukprn": string | null,"updated_at": string,"verification_method": Database["public"]['Enums']["verification_method"]
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country": string,"created_at"?: string,"cricos_provider_code"?: string | null,"id"?: string,"ipeds_unitid"?: string | null,"name": string,"official_domain"?: string | null,"other_ids"?: NonNullable<Json>,"region"?: string | null,"ror_id"?: string | null,"source_id"?: string | null,"ukprn"?: string | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"]
                  }
                  Update: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"cricos_provider_code"?: string | null,"id"?: string,"ipeds_unitid"?: string | null,"name"?: string,"official_domain"?: string | null,"other_ids"?: NonNullable<Json>,"region"?: string | null,"ror_id"?: string | null,"source_id"?: string | null,"ukprn"?: string | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "institutions_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"match_runs": {
                  Row: {
                    "algorithm_version": string,"catalog_hash": string,"created_at": string,"id": string,"profile_snapshot": NonNullable<Json>,"results": NonNullable<Json>,"user_id": string,"weights": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "algorithm_version": string,"catalog_hash": string,"created_at"?: string,"id"?: string,"profile_snapshot": NonNullable<Json>,"results": NonNullable<Json>,"user_id": string,"weights": NonNullable<Json>
                  }
                  Update: {
                    "algorithm_version"?: string,"catalog_hash"?: string,"created_at"?: string,"id"?: string,"profile_snapshot"?: NonNullable<Json>,"results"?: NonNullable<Json>,"user_id"?: string,"weights"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"emailed_at": string | null,"id": string,"kind": Database["public"]['Enums']["notification_kind"],"program_id": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["notification_kind"],"program_id"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"emailed_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["notification_kind"],"program_id"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"outcomes": {
                  Row: {
                    "application_id": string,"created_at": string,"cycle_id": string,"decided_at": string | null,"decision": Database["public"]['Enums']["decision"],"funding_amount": number | null,"funding_currency": string | null,"funding_offered": boolean | null,"id": string,"profile_snapshot": NonNullable<Json>,"program_id": string,"user_id": string,"verification_level": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"cycle_id": string,"decided_at"?: string | null,"decision": Database["public"]['Enums']["decision"],"funding_amount"?: number | null,"funding_currency"?: string | null,"funding_offered"?: boolean | null,"id"?: string,"profile_snapshot"?: NonNullable<Json>,"program_id": string,"user_id": string,"verification_level"?: string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"cycle_id"?: string,"decided_at"?: string | null,"decision"?: Database["public"]['Enums']["decision"],"funding_amount"?: number | null,"funding_currency"?: string | null,"funding_offered"?: boolean | null,"id"?: string,"profile_snapshot"?: NonNullable<Json>,"program_id"?: string,"user_id"?: string,"verification_level"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outcomes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"parental_consent_requests": {
                  Row: {
                    "confirmed_at": string | null,"created_at": string,"expires_at": string,"id": string,"parent_email": string,"token_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"parent_email": string,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"parent_email"?: string,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "age_band": Database["public"]['Enums']["age_band"],"birth_month": string,"budget_amount": number | null,"budget_currency": string | null,"consent_state": Database["public"]['Enums']["consent_state"],"created_at": string,"display_name": string | null,"grade_scale": string | null,"grade_text": string | null,"grade_value": number | null,"home_qualification": string | null,"intake_year": number | null,"preferences": NonNullable<Json>,"reminder_days": (number)[],"reminders_enabled": boolean,"research_interests": string | null,"residence_country": string,"target_countries": (string)[],"target_fields": (string)[],"target_levels": (Database["public"]['Enums']["program_level"])[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_band": Database["public"]['Enums']["age_band"],"birth_month": string,"budget_amount"?: number | null,"budget_currency"?: string | null,"consent_state": Database["public"]['Enums']["consent_state"],"created_at"?: string,"display_name"?: string | null,"grade_scale"?: string | null,"grade_text"?: string | null,"grade_value"?: number | null,"home_qualification"?: string | null,"intake_year"?: number | null,"preferences"?: NonNullable<Json>,"reminder_days"?: (number)[],"reminders_enabled"?: boolean,"research_interests"?: string | null,"residence_country": string,"target_countries"?: (string)[],"target_fields"?: (string)[],"target_levels"?: (Database["public"]['Enums']["program_level"])[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "age_band"?: Database["public"]['Enums']["age_band"],"birth_month"?: string,"budget_amount"?: number | null,"budget_currency"?: string | null,"consent_state"?: Database["public"]['Enums']["consent_state"],"created_at"?: string,"display_name"?: string | null,"grade_scale"?: string | null,"grade_text"?: string | null,"grade_value"?: number | null,"home_qualification"?: string | null,"intake_year"?: number | null,"preferences"?: NonNullable<Json>,"reminder_days"?: (number)[],"reminders_enabled"?: boolean,"research_interests"?: string | null,"residence_country"?: string,"target_countries"?: (string)[],"target_fields"?: (string)[],"target_levels"?: (Database["public"]['Enums']["program_level"])[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"program_cycles": {
                  Row: {
                    "created_at": string,"id": string,"intake_term": string,"intake_year": number,"is_current": boolean,"label": string,"program_id": string,"starts_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"intake_term": string,"intake_year": number,"is_current"?: boolean,"label": string,"program_id": string,"starts_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"intake_term"?: string,"intake_year"?: number,"is_current"?: boolean,"label"?: string,"program_id"?: string,"starts_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_cycles_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_cycles_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"program_sources": {
                  Row: {
                    "active": boolean,"content_hash": string | null,"created_at": string,"etag": string | null,"id": string,"kind": Database["public"]['Enums']["source_kind"],"last_changed_at": string | null,"last_checked_at": string | null,"last_modified": string | null,"program_id": string,"rights_note": string | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"content_hash"?: string | null,"created_at"?: string,"etag"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["source_kind"],"last_changed_at"?: string | null,"last_checked_at"?: string | null,"last_modified"?: string | null,"program_id": string,"rights_note"?: string | null,"url": string
                  }
                  Update: {
                    "active"?: boolean,"content_hash"?: string | null,"created_at"?: string,"etag"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["source_kind"],"last_changed_at"?: string | null,"last_checked_at"?: string | null,"last_modified"?: string | null,"program_id"?: string,"rights_note"?: string | null,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_sources_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_sources_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "cip": string | null,"coverage_tier": Database["public"]['Enums']["coverage_tier"],"created_at": string,"credit_system": Database["public"]['Enums']["credit_system"] | null,"delivery_mode": Database["public"]['Enums']["delivery_mode"],"duration_months": number | null,"field_label": string | null,"id": string,"institution_id": string,"isced_f": string | null,"isced_level": number | null,"languages_of_instruction": (string)[],"level": Database["public"]['Enums']["program_level"],"official_url": string | null,"published": boolean,"register_ids": NonNullable<Json>,"required_credits": number | null,"search_tsv": unknown,"slug": string,"source_id": string | null,"title": string,"track": string | null,"updated_at": string,"verification_method": Database["public"]['Enums']["verification_method"]
                  }
                  ComputedFields: never
                  Insert: {
                    "cip"?: string | null,"coverage_tier"?: Database["public"]['Enums']["coverage_tier"],"created_at"?: string,"credit_system"?: Database["public"]['Enums']["credit_system"] | null,"delivery_mode"?: Database["public"]['Enums']["delivery_mode"],"duration_months"?: number | null,"field_label"?: string | null,"id"?: string,"institution_id": string,"isced_f"?: string | null,"isced_level"?: number | null,"languages_of_instruction"?: (string)[],"level": Database["public"]['Enums']["program_level"],"official_url"?: string | null,"published"?: boolean,"register_ids"?: NonNullable<Json>,"required_credits"?: number | null,"search_tsv"?: never,"slug": string,"source_id"?: string | null,"title": string,"track"?: string | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"]
                  }
                  Update: {
                    "cip"?: string | null,"coverage_tier"?: Database["public"]['Enums']["coverage_tier"],"created_at"?: string,"credit_system"?: Database["public"]['Enums']["credit_system"] | null,"delivery_mode"?: Database["public"]['Enums']["delivery_mode"],"duration_months"?: number | null,"field_label"?: string | null,"id"?: string,"institution_id"?: string,"isced_f"?: string | null,"isced_level"?: number | null,"languages_of_instruction"?: (string)[],"level"?: Database["public"]['Enums']["program_level"],"official_url"?: string | null,"published"?: boolean,"register_ids"?: NonNullable<Json>,"required_credits"?: number | null,"search_tsv"?: never,"slug"?: string,"source_id"?: string | null,"title"?: string,"track"?: string | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "institutions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_institution_id_fkey"
      columns: ["institution_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["institution_id"]
    },{
      foreignKeyName: "programs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_log": {
                  Row: {
                    "application_id": string,"days_before": number,"due_at": string,"id": string,"sent_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"days_before": number,"due_at": string,"id"?: string,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "application_id"?: string,"days_before"?: number,"due_at"?: string,"id"?: string,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_log_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"requirements": {
                  Row: {
                    "applicant_category": Database["public"]['Enums']["applicant_category"],"count_required": number | null,"created_at": string,"current_version_id": string | null,"cycle_id": string,"details": string | null,"evidence_quote": string | null,"exam": Database["public"]['Enums']["exam_kind"] | null,"exam_version": string | null,"grade_scale": string | null,"id": string,"is_desirable": boolean,"kind": Database["public"]['Enums']["requirement_kind"],"min_grade_numeric": number | null,"min_grade_text": string | null,"min_sections": Json | null,"min_total": number | null,"published": boolean,"qualification": string | null,"source_id": string | null,"status": Database["public"]['Enums']["fact_status"],"test_policy": Database["public"]['Enums']["test_policy"] | null,"updated_at": string,"verification_method": Database["public"]['Enums']["verification_method"] | null,"verified_at": string | null,"verified_by": string | null,"word_limit": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"count_required"?: number | null,"created_at"?: string,"current_version_id"?: string | null,"cycle_id": string,"details"?: string | null,"evidence_quote"?: string | null,"exam"?: Database["public"]['Enums']["exam_kind"] | null,"exam_version"?: string | null,"grade_scale"?: string | null,"id"?: string,"is_desirable"?: boolean,"kind": Database["public"]['Enums']["requirement_kind"],"min_grade_numeric"?: number | null,"min_grade_text"?: string | null,"min_sections"?: Json | null,"min_total"?: number | null,"published"?: boolean,"qualification"?: string | null,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"test_policy"?: Database["public"]['Enums']["test_policy"] | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null,"word_limit"?: number | null
                  }
                  Update: {
                    "applicant_category"?: Database["public"]['Enums']["applicant_category"],"count_required"?: number | null,"created_at"?: string,"current_version_id"?: string | null,"cycle_id"?: string,"details"?: string | null,"evidence_quote"?: string | null,"exam"?: Database["public"]['Enums']["exam_kind"] | null,"exam_version"?: string | null,"grade_scale"?: string | null,"id"?: string,"is_desirable"?: boolean,"kind"?: Database["public"]['Enums']["requirement_kind"],"min_grade_numeric"?: number | null,"min_grade_text"?: string | null,"min_sections"?: Json | null,"min_total"?: number | null,"published"?: boolean,"qualification"?: string | null,"source_id"?: string | null,"status"?: Database["public"]['Enums']["fact_status"],"test_policy"?: Database["public"]['Enums']["test_policy"] | null,"updated_at"?: string,"verification_method"?: Database["public"]['Enums']["verification_method"] | null,"verified_at"?: string | null,"verified_by"?: string | null,"word_limit"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "requirements_current_version_id_fkey"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "fact_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "requirements_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "ai_run_id": string | null,"compared_version_id": string | null,"created_at": string,"id": string,"kind": string,"model": string,"prompt_version": string,"result": NonNullable<Json>,"user_id": string,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_run_id"?: string | null,"compared_version_id"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"model": string,"prompt_version": string,"result": NonNullable<Json>,"user_id": string,"version_id": string
                  }
                  Update: {
                    "ai_run_id"?: string | null,"compared_version_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"model"?: string,"prompt_version"?: string,"result"?: NonNullable<Json>,"user_id"?: string,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_ai_run_id_fkey"
      columns: ["ai_run_id"]
isOneToOne: false
      referencedRelation: "ai_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_compared_version_id_fkey"
      columns: ["compared_version_id"]
isOneToOne: false
      referencedRelation: "document_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "document_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"shortlists": {
                  Row: {
                    "created_at": string,"cycle_id": string | null,"eligibility": Json | null,"fit_score": number | null,"id": string,"note": string | null,"program_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cycle_id"?: string | null,"eligibility"?: Json | null,"fit_score"?: number | null,"id"?: string,"note"?: string | null,"program_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"cycle_id"?: string | null,"eligibility"?: Json | null,"fit_score"?: number | null,"id"?: string,"note"?: string | null,"program_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shortlists_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "program_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shortlists_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "program_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shortlists_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"signups": {
                  Row: {
                    "confirmed_13_plus": boolean,"created_at": string,"destination_countries": (string)[],"email": string,"field": string | null,"id": string,"interest": Database["public"]['Enums']["signup_interest"],"residence_country": string | null,"target_level": Database["public"]['Enums']["program_level"],"utm": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_13_plus": boolean,"created_at"?: string,"destination_countries"?: (string)[],"email": string,"field"?: string | null,"id"?: string,"interest": Database["public"]['Enums']["signup_interest"],"residence_country"?: string | null,"target_level": Database["public"]['Enums']["program_level"],"utm"?: NonNullable<Json>
                  }
                  Update: {
                    "confirmed_13_plus"?: boolean,"created_at"?: string,"destination_countries"?: (string)[],"email"?: string,"field"?: string | null,"id"?: string,"interest"?: Database["public"]['Enums']["signup_interest"],"residence_country"?: string | null,"target_level"?: Database["public"]['Enums']["program_level"],"utm"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"sources": {
                  Row: {
                    "content_hash": string | null,"created_at": string,"extractor_version": string | null,"fetched_at": string | null,"http_status": number | null,"id": string,"owner": string,"rights_note": string | null,"robots_ok": boolean | null,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash"?: string | null,"created_at"?: string,"extractor_version"?: string | null,"fetched_at"?: string | null,"http_status"?: number | null,"id"?: string,"owner": string,"rights_note"?: string | null,"robots_ok"?: boolean | null,"url": string
                  }
                  Update: {
                    "content_hash"?: string | null,"created_at"?: string,"extractor_version"?: string | null,"fetched_at"?: string | null,"http_status"?: number | null,"id"?: string,"owner"?: string,"rights_note"?: string | null,"robots_ok"?: boolean | null,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"story_answers": {
                  Row: {
                    "answer": string,"question_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"question_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answer"?: string,"question_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"test_scores": {
                  Row: {
                    "created_at": string,"exam": Database["public"]['Enums']["exam_kind"],"exam_version": string | null,"id": string,"sections": NonNullable<Json>,"taken_on": string | null,"total": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"exam": Database["public"]['Enums']["exam_kind"],"exam_version"?: string | null,"id"?: string,"sections"?: NonNullable<Json>,"taken_on"?: string | null,"total"?: number | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"exam"?: Database["public"]['Enums']["exam_kind"],"exam_version"?: string | null,"id"?: string,"sections"?: NonNullable<Json>,"taken_on"?: string | null,"total"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "program_cards": {
                  Row: {
                    "cip": string | null,"city": string | null,"country": string,"coverage_tier": Database["public"]['Enums']["coverage_tier"],"credit_system": Database["public"]['Enums']["credit_system"] | null,"delivery_mode": Database["public"]['Enums']["delivery_mode"],"duration_months": number | null,"facts_total": number | null,"facts_verified": number | null,"field_label": string | null,"id": string,"institution_id": string,"institution_name": string,"isced_f": string | null,"isced_level": number | null,"languages_of_instruction": (string)[],"level": Database["public"]['Enums']["program_level"],"official_url": string | null,"published": boolean,"required_credits": number | null,"slug": string,"title": string,"track": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_apply_fact_version":
{ Args: { "p_method": Database["public"]['Enums']["verification_method"],"p_status": Database["public"]['Enums']["fact_status"],"p_verified_at": string,"p_verified_by": string,"p_version": Omit<Database["public"]['Tables']["fact_versions"]['Row'], Database["public"]['Tables']["fact_versions"]['ComputedFields']> }; Returns: string
                           },
"add_program_cycle":
{ Args: { "p_intake_term": string,"p_intake_year": number,"p_program_id": string,"p_starts_on"?: string }; Returns: string
                           },
"age_band_for":
{ Args: { "p_age": number }; Returns: Database["public"]['Enums']["age_band"]
                           },
"age_in_years":
{ Args: { "p_birth_month": string,"p_on"?: string }; Returns: number
                           },
"can_process_personal_data":
{ Args: { "uid": string }; Returns: boolean
                           },
"confirm_parental_consent":
{ Args: { "p_policy_version": string,"p_token": string }; Returns: boolean
                           },
"credit_balance":
{ Args: { "p_uid"?: string }; Returns: number
                           },
"grant_credits":
{ Args: { "p_amount": number,"p_reason"?: string,"p_user_id": string }; Returns: undefined
                           },
"has_consent":
{ Args: { "p_kind": Database["public"]['Enums']["consent_kind"],"p_uid": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_operator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"notifier_recipients":
{ Args: Record<PropertyKey, never>; Returns: {
              "email": string,"reminder_days": (number)[],"user_id": string
            }[]
                           },
"notify_program_watchers":
{ Args: { "p_body": string,"p_program_id": string,"p_title": string }; Returns: number
                           },
"parental_consent_age":
{ Args: { "p_country": string }; Returns: number
                           },
"promote_fact_version":
{ Args: { "p_method"?: Database["public"]['Enums']["verification_method"],"p_reviewer_name"?: string,"p_status"?: Database["public"]['Enums']["fact_status"],"p_verified_at"?: string,"p_version_id": string }; Returns: string
                           },
"publish_extracted_version":
{ Args: { "p_version_id": string }; Returns: string
                           },
"recompute_coverage":
{ Args: { "p_program_id": string }; Returns: Database["public"]['Enums']["coverage_tier"]
                           },
"record_writing_review":
{ Args: { "p_ai_run_id"?: string,"p_compared_version_id"?: string,"p_kind": string,"p_model": string,"p_prompt_version": string,"p_result": Json,"p_version_id": string }; Returns: string
                           },
"reject_fact_version":
{ Args: { "p_reason": string,"p_version_id": string }; Returns: undefined
                           },
"request_parental_consent":
{ Args: { "p_parent_email": string,"p_token_hash": string }; Returns: string
                           },
"resolve_fact_report":
{ Args: { "p_accepted": boolean,"p_credits"?: number,"p_report_id": string }; Returns: undefined
                           },
"search_programs":
{ Args: { "p_countries"?: (string)[],"p_delivery"?: (Database["public"]['Enums']["delivery_mode"])[],"p_fields"?: (string)[],"p_levels"?: (Database["public"]['Enums']["program_level"])[],"p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: {
              "cip": string | null,
"city": string | null,
"country": string,
"coverage_tier": Database["public"]['Enums']["coverage_tier"],
"credit_system": Database["public"]['Enums']["credit_system"] | null,
"delivery_mode": Database["public"]['Enums']["delivery_mode"],
"duration_months": number | null,
"facts_total": number | null,
"facts_verified": number | null,
"field_label": string | null,
"id": string,
"institution_id": string,
"institution_name": string,
"isced_f": string | null,
"isced_level": number | null,
"languages_of_instruction": (string)[],
"level": Database["public"]['Enums']["program_level"],
"official_url": string | null,
"published": boolean,
"required_credits": number | null,
"slug": string,
"title": string,
"track": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "program_cards"
        isOneToOne: false
        isSetofReturn: true
      } },
"verification_demand":
{ Args: { "p_limit"?: number }; Returns: {
              "facts_unverified": number,"next_deadline": string,"program_id": string,"shortlists": number
            }[]
                           },
"writing_allowance":
{ Args: Record<PropertyKey, never>; Returns: {
              "balance": number,"free_review": boolean
            }[]
                           }
          }
          Enums: {
            "age_band": "under_13"|"age_13_15"|"age_16_17"|"adult","applicant_category": "all"|"domestic"|"international"|"eu_eea"|"uk_home","application_status": "shortlisted"|"preparing"|"submitted"|"decided"|"withdrawn","consent_kind": "terms"|"privacy"|"parental"|"ai_processing"|"outcomes_research"|"marketing"|"agency_sharing","consent_state": "not_required"|"pending_parental"|"granted"|"revoked","cost_basis": "per_credit"|"per_term"|"per_year"|"per_month"|"total"|"one_off","cost_kind": "tuition"|"fees"|"insurance"|"living"|"application_fee"|"other","coverage_tier": "listed"|"extracted"|"verified","credit_system": "us_credit"|"ects"|"uk_cats"|"other","date_precision": "exact_time"|"date"|"month","deadline_kind": "application"|"priority"|"funding"|"scholarship"|"documents"|"deposit","decision": "admitted"|"rejected"|"waitlisted"|"withdrawn"|"deferred","delivery_mode": "on_campus"|"online"|"hybrid","document_kind": "statement_of_purpose"|"personal_statement"|"why_this_university"|"other","exam_kind": "ielts_academic"|"ielts_ukvi"|"toefl_ibt"|"toefl_ibt_home"|"pte_academic"|"duolingo"|"cambridge_c1_c2"|"testdaf"|"dsh"|"goethe"|"delf_dalf"|"tcf"|"gre"|"gmat"|"sat"|"act","fact_status": "verified"|"unverified"|"conflicting"|"unknown","fact_subject": "requirement"|"deadline"|"cost_item","notification_kind": "fact_changed"|"reminder"|"report_resolved"|"agency","owning_system": "direct"|"ucas"|"uni_assist"|"common_app"|"ouac"|"uac"|"cao"|"other","program_level": "foundation"|"diploma"|"bachelor"|"master"|"doctorate","requirement_kind": "entry_qualification"|"language_test"|"admissions_test"|"prerequisite"|"recommendation_letters"|"statement"|"portfolio"|"interview"|"other","review_state": "pending"|"approved"|"rejected"|"superseded"|"auto_rejected","signup_interest": "verified_tracker"|"writing_coach","source_kind": "course"|"admissions"|"requirements"|"international"|"fees"|"deadlines","test_policy": "required"|"recommended"|"optional"|"not_accepted"|"waived_conditional"|"unknown"|"conflicting","verification_method": "human_review"|"seed_manual"|"official_register"|"automated_extraction"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "age_band": ["under_13", "age_13_15", "age_16_17", "adult"],"applicant_category": ["all", "domestic", "international", "eu_eea", "uk_home"],"application_status": ["shortlisted", "preparing", "submitted", "decided", "withdrawn"],"consent_kind": ["terms", "privacy", "parental", "ai_processing", "outcomes_research", "marketing", "agency_sharing"],"consent_state": ["not_required", "pending_parental", "granted", "revoked"],"cost_basis": ["per_credit", "per_term", "per_year", "per_month", "total", "one_off"],"cost_kind": ["tuition", "fees", "insurance", "living", "application_fee", "other"],"coverage_tier": ["listed", "extracted", "verified"],"credit_system": ["us_credit", "ects", "uk_cats", "other"],"date_precision": ["exact_time", "date", "month"],"deadline_kind": ["application", "priority", "funding", "scholarship", "documents", "deposit"],"decision": ["admitted", "rejected", "waitlisted", "withdrawn", "deferred"],"delivery_mode": ["on_campus", "online", "hybrid"],"document_kind": ["statement_of_purpose", "personal_statement", "why_this_university", "other"],"exam_kind": ["ielts_academic", "ielts_ukvi", "toefl_ibt", "toefl_ibt_home", "pte_academic", "duolingo", "cambridge_c1_c2", "testdaf", "dsh", "goethe", "delf_dalf", "tcf", "gre", "gmat", "sat", "act"],"fact_status": ["verified", "unverified", "conflicting", "unknown"],"fact_subject": ["requirement", "deadline", "cost_item"],"notification_kind": ["fact_changed", "reminder", "report_resolved", "agency"],"owning_system": ["direct", "ucas", "uni_assist", "common_app", "ouac", "uac", "cao", "other"],"program_level": ["foundation", "diploma", "bachelor", "master", "doctorate"],"requirement_kind": ["entry_qualification", "language_test", "admissions_test", "prerequisite", "recommendation_letters", "statement", "portfolio", "interview", "other"],"review_state": ["pending", "approved", "rejected", "superseded", "auto_rejected"],"signup_interest": ["verified_tracker", "writing_coach"],"source_kind": ["course", "admissions", "requirements", "international", "fees", "deadlines"],"test_policy": ["required", "recommended", "optional", "not_accepted", "waived_conditional", "unknown", "conflicting"],"verification_method": ["human_review", "seed_manual", "official_register", "automated_extraction"]
          }
        }
} as const
