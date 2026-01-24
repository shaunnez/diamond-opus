import { gql } from 'graphql-request';

export const AUTHENTICATE_QUERY = gql`
  query Authenticate($username: String!, $password: String!) {
    authenticate {
      username_and_password(username: $username, password: $password) {
        token
      }
    }
  }
`;

export const DIAMONDS_COUNT_QUERY = gql`
  query GetDiamondsCount($token: String!, $query: DiamondQuery!) {
    as(token: $token) {
      diamonds_by_query_count(query: $query)
    }
  }
`;

export const DIAMONDS_BY_QUERY = gql`
  query DiamondsByQuery(
    $token: String!
    $query: DiamondQuery!
    $offset: Int
    $limit: Int
    $order: DiamondOrder
  ) {
    as(token: $token) {
      diamonds_by_query(
        query: $query
        offset: $offset
        limit: $limit
        order: $order
      ) {
        total_count
        items {
          id
          price
          discount
          diamond_price
          markup_price
          markup_discount
          diamond {
            id
            availability
            HoldId
            NivodaStockId
            supplierStockId
            image
            video
            eyeClean
            brown
            green
            blue
            gray
            milky
            bowtie
            mine_of_origin
            supplier_video_link
            approval_type
            final_price
            show_measurements
            show_certificate_number
            return_window
            CertificateType
            delivery_time {
              express_timeline_applicable
              min_business_days
              max_business_days
            }
            certificate {
              id
              lab
              certNumber
              pdfUrl
              shape
              fullShape
              carats
              clarity
              cut
              polish
              symmetry
              color
              length
              width
              depth
              depthPercentage
              table
              crownAngle
              crownHeight
              pavAngle
              pavHeight
              pavDepth
              floInt
              floCol
              verified
              labgrown
              labgrown_type
              treated
              girdle
              culetSize
              girdleCondition
              culet_condition
              cut_style
              keyToSymbols
              comments
            }
            supplier {
              id
              name
              legal_name
            }
          }
        }
      }
    }
  }
`;

export const CREATE_HOLD_MUTATION = gql`
  mutation CreateHold($token: String!, $productId: ID!, $productType: String!) {
    as(token: $token) {
      create_hold(product_id: $productId, product_type: $productType) {
        id
        denied
        until
      }
    }
  }
`;

export const CREATE_ORDER_MUTATION = gql`
  mutation CreateOrder(
    $token: String!
    $offerId: ID!
    $destinationId: ID!
    $reference: String
    $comments: String
    $returnOption: String
  ) {
    as(token: $token) {
      create_order(
        offer_id: $offerId
        destination_id: $destinationId
        reference: $reference
        comments: $comments
        return_option: $returnOption
      ) {
        id
        status
      }
    }
  }
`;
